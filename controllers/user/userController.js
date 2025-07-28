const User = require('../../models/userSchema');
const bcrypt = require('bcrypt');
const sendOtpEmail = require('../../utils/sendOtp');
const Wallet = require('../../models/walletSchema');
const passport = require('passport');
 

//get sign up page
exports.getSignUp = async (req, res) => {
    try {
    if (req.session.user) {
        return res.redirect('/profile');
    }
    if(req.session.tempUser){
        return res.redirect('/verify-otp')
    }
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '-1');

    const referralCode = req.query.ref || '';

    let isValidReferral = false;

    if (referralCode) {
      const referredUser = await User.findOne({ referralCode: referralCode.trim() });
      if (referredUser) isValidReferral = true;
    }
        res.render('auth/signup', { referralCode,isValidReferral });
    } catch (error) {
        console.log('Error fetching signup form', error);
        res.status(500).send('Server Error');
    }
};


//get login page
exports.getLogin = async (req, res) => {
    try {
        if (req.session.user) {
            return res.redirect('/profile');
        }
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '-1');

        res.render('auth/login');
    } catch (error) {
        console.error('Error fetching login page:', error);
        return res.status(500).send('Server Error');
    }
};

//submit login
exports.login=async(req,res)=>{
    try{
        const {email,password}=req.body;
        const user = await User.findOne({ email });
        
         if (!user) {
            return res.status(400).json({ errorType: "top", error: "Email not registered" });
        }

        if (user.isBlocked) {
            return res.status(403).json({ errorType: "top", error: "User blocked by admin" });
        }

         if (!user.password) {
            return res.status(400).json({ errorType: "top", error: "This account was created using Google. Please login with Google." });
        }
        const isMatch = await bcrypt.compare(password.trim(), user.password);

        if (!isMatch) {
            return res.status(400).json({ errorType: "top", error: "Incorrect password" });
        }

          req.session.user = {
            id: user._id,
            name: user.name,
            email: user.email,
            profilePicture: user.profilePicture,
        };
        
        await user.createSession(req.sessionID);
        return res.status(200).json({ message: "Login successful" });

    }catch(error){
        console.error('Login error:', error);
        res.status(404).json({ error: 'Page Not Found' });
    }
}

//submit signup
exports.submitSignup = async (req, res) => {
    try {
        const { name, email, password, Cpassword, referralCode } = req.body;
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ errorType: "top", error: "Email already registered" });
        }

        let referredByUser=null;

        if(referralCode){
            referredByUser=await User.findOne({referralCode:referralCode.trim()})
             if (!referredByUser) {
                return res.status(400).json({ errorType: "top", error: "Invalid referral code" });
            }
        }
        const otp = Math.floor(100000 + Math.random() * 900000);
        const hashedPassword = await bcrypt.hash(password, 10);

        const otpCreatedAt = Date.now();
        const otpExpireAt = otpCreatedAt + 60000;

        req.session.tempUser = {
            name,
            email,
            password: hashedPassword,
            otp,
            otpCreatedAt,
            otpExpireAt,
            referredByUser:referredByUser?referredByUser._id:null
        };

        await sendOtpEmail(email, otp);
        console.log(`New OTP generated for signup ${otp}`);

        return res.status(200).json({ 
            redirect: "/verify-otp", 
            otpCreatedAt,
            otpExpireAt
        });
    } catch (error) {
        console.error("Signup error:", error);
        return res.status(500).json({ errorType: "top", error: "Server error during signup" });
    }
};


//get otp page for signup
exports.getVerifyotpPage = (req, res) => {
    try {
        const tempUser = req.session.tempUser;
        if (!tempUser) {
            return res.redirect('/login');
        }
         res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '-1');
        res.render('auth/verify-otp', {
            otpCreatedAt: tempUser.otpCreatedAt,
            expiresAt: tempUser.otpExpireAt || (Date.now() + 60000)
        });
    } catch (error) {
        console.error('Error fetching OTP verification page:', error);
        res.status(500).send('Server Error');
    }
};


//submit otp for signup
exports.submitOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        const tempUser = req.session.tempUser;
        
        if (!tempUser) {
            return res.status(400).json({ errorType: "top", error: "Session expired. Please register again." });
        }

        const currentTime = Date.now();
        if (currentTime > tempUser.otpExpireAt) {
            req.session.tempUser = null;
            return res.status(400).json({ errorType: "top", error: "OTP expired. Please register again." });
        }

        if (parseInt(otp) !== tempUser.otp) {
            return res.status(400).json({ errorType: "top", error: "Invalid OTP" });
        }

        const newUser = new User({
            name: tempUser.name,
            email: tempUser.email,
            password: tempUser.password,
            referredBy:tempUser.referredByUser
        });

        await newUser.save();

        if(tempUser.referredByUser){
            const newUserWallet=await Wallet.getOrCreate(newUser._id);
            await newUserWallet.addMoney(50, 'Referral bonus - Welcome gift for joining!');

            const referrerWallet = await Wallet.getOrCreate(tempUser.referredByUser);
            await referrerWallet.addMoney(100, 'Referral bonus - Thank you for sharing!');

        }

        req.session.tempUser = null;
        return res.status(200).json({
            message: "OTP verified",
            redirect: "/login",   
        });
    } catch (error) {
        console.error("OTP verification error:", error);
        return res.status(500).json({ errorType: "top", error: "Server error during OTP verification" });
    }
};

//resend otp for singup
exports.resendOtp = async (req, res) => {
    try {
        const tempUser = req.session.tempUser;
        if (!tempUser) {
            return res.status(400).json({ errorType: "top", error: "Session expired. Please register again." });
        }

        const otp = Math.floor(100000 + Math.random() * 900000);
        const otpCreatedAt = Date.now();
        const otpExpireAt = otpCreatedAt + 60000;

        req.session.tempUser.otp = otp;
        req.session.tempUser.otpCreatedAt = otpCreatedAt;
        req.session.tempUser.otpExpireAt = otpExpireAt;

        await sendOtpEmail(tempUser.email, otp);
        console.log(`New OTP resent: ${otp}, Email: ${tempUser.email}, CreatedAt: ${otpCreatedAt}`);

        return res.status(200).json({ 
            message: "OTP resent", 
            otpCreatedAt,
            expiresAt: otpExpireAt 
        });
    } catch (error) {
        console.error("Error resending OTP:", error);
        return res.status(500).json({ errorType: "top", error: "Server error while resending OTP" });
    }
};

//login forgot password
exports.getForgotPassword = (req, res) => {
    try {
       
        res.render('auth/forgot-password');
    } catch (error) {
        console.error('Error fetching forgot password page:', error);
        return res.status(500).send('Server Error');
    }
};

//login submit forgot password
exports.submitForgotPassword = async (req, res) => {
    try {
        
        const { email } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ 
                errorType: 'top', 
                error: 'No account found with this email' 
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000);
        const otpCreatedAt = Date.now();
        const expiresAt = otpCreatedAt + 60000; // Changed to 60 seconds

        req.session.forgotPasswordUser = {
            email,
            otp,
            createdAt: otpCreatedAt,
            expiresAt
        };

        await sendOtpEmail(email, otp);
        console.log(`Forgot password OTP sent: ${otp}, Email: ${email}`);

        return res.status(200).json({
            message: "OTP sent successfully",
            redirect: "/verify-password-otp",
            otpCreatedAt,
            expiresAt
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        return res.status(500).json({
            errorType: 'top',
            error: 'Server error, please try again later'
        });
    }
};

//resnd otp for forgot password
exports.resendForgotPasswordOtp = async (req, res) => {
    try {
        const forgotPasswordUser = req.session.forgotPasswordUser;
        
        if (!forgotPasswordUser) {
            return res.status(400).json({ 
                errorType: "top", 
                error: "Session expired. Please try again." 
            });
        }

        const email = forgotPasswordUser.email;
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(404).json({ 
                errorType: "top", 
                error: "No account found with this email" 
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000);
        const otpCreatedAt = Date.now();
        const expiresAt = otpCreatedAt + 60000; 

        req.session.forgotPasswordUser = {
            email,
            otp,
            createdAt: otpCreatedAt,
            expiresAt
        };

        await sendOtpEmail(email, otp);
        console.log(`Resent forgot password OTP: ${otp}, Email: ${email}`);

        return res.status(200).json({ 
            message: "OTP resent successfully", 
            otpCreatedAt,
            expiresAt
        });
    } catch (error) {
        console.error("Error resending OTP:", error);
        return res.status(500).json({ 
            errorType: "top", 
            error: "Server error while resending OTP" 
        });
    }
};

//get new password verification otp
exports.getPasswordOtpVerifyPage = (req, res) => {
    try {
        const forgotPasswordUser = req.session.forgotPasswordUser;
        if (!forgotPasswordUser) {
            return res.redirect('/forgot-password');
        }
        
        res.render('auth/forgot-password-otp-verify', {
            otpCreatedAt: forgotPasswordUser.createdAt,
            expiresAt: forgotPasswordUser.expiresAt,
            email: forgotPasswordUser.email
        });
    } catch (error) {
        console.error('Error fetching password OTP verification page:', error);
        return res.status(500).send('Server Error');
    }
};


//verify otp for new password
exports.verifyForgotPasswordOtp = async (req, res) => {
    try {
        
        const { otp } = req.body;
        const forgotPasswordUser = req.session.forgotPasswordUser;

        if (!forgotPasswordUser) {
            return res.status(400).json({ 
                errorType: "top", 
                error: "Session expired. Please try again." 
            });
        }

        const currentTime = Date.now();

        if (currentTime > forgotPasswordUser.expiresAt) {
            req.session.forgotPasswordUser = null;
            return res.status(400).json({ 
                errorType: "top", 
                error: "OTP expired. Please try again." 
            });
        }

        if (parseInt(otp) !== forgotPasswordUser.otp) {
            return res.status(400).json({ 
                errorType: "top", 
                error: "Invalid OTP" 
            });
        }

        req.session.otpVerified = true;
        req.session.forgotPasswordEmail = forgotPasswordUser.email;
        req.session.forgotPasswordUser = null; 


        return res.status(200).json({ 
            message: "OTP verified successfully", 
            redirect: "/reset-password" 
        });
    } catch (error) {
        console.error("OTP verification error:", error);
        return res.status(500).json({ 
            errorType: "top", 
            error: "Server error during OTP verification" 
        });
    }
};


//get reset password
exports.getResetPassword = (req, res) => {
    try {
        if (!req.session.otpVerified || !req.session.forgotPasswordEmail) {
            console.log('Unauthorized access to reset password page');
            return res.redirect('/forgot-password');
        }
        
        res.render('auth/reset-password', {
            email: req.session.forgotPasswordEmail
        });
    } catch (error) {
        console.error('Error fetching reset password page:', error);
        return res.status(500).send('Server Error');
    }
};


//submit reset password
exports.resetPassword = async (req, res) => {
    try {

        if (!req.session.otpVerified || !req.session.forgotPasswordEmail) {
            return res.status(403).json({ 
                errorType: "top", 
                error: "Unauthorized access. Please verify OTP first." 
            });
        }

        const { password, confirmPassword } = req.body;
        const email = req.session.forgotPasswordEmail;

        if (!password || !confirmPassword) {
            return res.status(400).json({ 
                errorType: "top", 
                error: "Password and confirm password are required" 
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ 
                errorType: "confirmPassword", 
                error: "Passwords do not match" 
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                errorType: "password", 
                error: "Password must be at least 6 characters long" 
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ 
                errorType: "top", 
                error: "User not found" 
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await User.updateOne({ email }, { password: hashedPassword });

        // Clear session data
        req.session.otpVerified = null;
        req.session.forgotPasswordEmail = null;
        req.session.forgotPasswordUser = null;


        return res.status(200).json({ 
            message: "Password reset successfully", 
            redirect: "/login" 
        });
    } catch (error) {
        console.error("Password reset error:", error);
        return res.status(500).json({ 
            errorType: "top", 
            error: "Server error during password reset" 
        });
    }
};


//logout
exports.logout = async (req, res) => {
    try {
        if (req.session && req.session.user) {
            const user = await User.findById(req.session.user.id);
            if (user) {
                await user.clearSession(); 
            }
        }

        req.session.destroy((err) => {
            if (err) {
                console.error('Session destruction error:', err);
                return res.redirect('/login'); 
            }
            res.clearCookie('connect.sid');
            res.redirect('/login');
        });

    } catch (error) {
        console.error('Logout error:', error);
        res.redirect('/login');
    }
};

//google authentication
exports.googleAuthentication = [
  (req, res, next) => {
    next();
  },
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    prompt: 'select_account' 
  })
];

exports.googleCallback = [
  (req, res, next) => {
    next();
  },
  passport.authenticate('google', {
    failureRedirect: '/login?topError=' + encodeURIComponent('Authentication failed'),
    failureFlash: true,
  }),
  async (req, res) => {
    try {
      const user = req.user;

      if (user.isBlocked) {
        req.logout((err) => {
          if (err) console.error('Logout error:', err);
          return res.redirect('/login?topError=' + encodeURIComponent('User blocked by admin'));
        });
        return;
      }

      req.session.user = {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
      };

      await user.createSession(req.sessionID);

     res.redirect('/');
    } catch (error) {
      console.error('Google callback error:', error);
      res.redirect('/login?topError=' + encodeURIComponent('Server error'));
    }
  },
];