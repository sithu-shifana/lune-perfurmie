const User=require('../../models/userSchema');
const Address=require('../../models/addressSchema')
const Wallet=require('../../models/walletSchema');
const bcrypt = require('bcrypt');
const sendOtpEmail = require('../../utils/sendOtp');



exports.getProfilePage = async (req, res) => {
    try {
        const userId = req.session.user?.id;
        const user = await User.findById(userId); 
        
        if (!user) {
            return res.redirect('/login');
        }

        const wallet = await Wallet.getOrCreate(userId);
        const defaultAddress = await Address.findOne({ userId, isDefault: true });

        if (!user.referralCode) {
            await user.generateReferralCode();
        }

        res.render('dashboard/profile', { defaultAddress, wallet });
    } catch (error) {
        console.error('Error getting profile page:', error);
        res.status(500).render('error');
    }
}


exports.updateProfile=async(req,res)=>{
    try{
        const { name, phoneNo } = req.body;
        const user=await User.findBySessionID(req.sessionID);
        
        if (phoneNo && !/^\d{10}$/.test(phoneNo)) {
            return res.status(400).json({ error: 'Invalid phone number. Must be 10 digits.' });
        }

        user.name = name.trim();
        user.phone = phoneNo ? phoneNo.trim() : user.phone;
        await user.save();

        res.json({ message: 'Profile updated successfully' });
    }catch(error){
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Error updating profile' });

    }
}

exports.uploadProfilePicture = async (req, res) => {
  try {
    // Check if a file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Find the user
    const user = await User.findById(req.session.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Save the new profile picture path
    const imageUrl = `/uploads/${req.file.filename}`;
    user.profilePicture = imageUrl;
    await user.save();

    // Return success response with the new image URL
    res.json({
      message: 'Profile picture uploaded successfully',
      imageUrl: imageUrl
    });
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    res.status(500).json({ error: error.message || 'Error uploading profile picture' });
  }
};


exports.getReferralCode = async (req, res) => {
    try {
        console.log('getReferralCode, session:', req.session);
        const userId = req.session.user?.id;
        const user = await User.findById(userId);
        const referralLink = `${req.protocol}://${req.get('host')}/signup?ref=${user.referralCode}`;

        res.json({
            referralCode: user.referralCode,
            referralLink: referralLink
        });
    } catch (error) {
        console.error('Error getting referral code:', error);
        res.status(500).json({ error: 'Server error' });
    }
};



exports.validatePassword = async (req, res) => {
  try {
    const { currentPassword } = req.body;
    const userId = req.session.user?.id
    const user = await User.findById(userId);
    
    console.log("Entered password:", JSON.stringify(currentPassword));
console.log("Stored password:", JSON.stringify(user.password));


    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required' });
    }

    if (user.isGoogleAuthenticated) {
      return res.status(400).json({ error: 'This account is logged in with Google and has no password' });
    }

    if (!user.password) {
      return res.status(400).json({ error: 'No password set for this account' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    res.status(200).json({ message: 'Password validated' });
  } catch (error) {
    console.error('Error validating password:', error);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    const userId = req.session.user?.id
    const user = await User.findById(userId);

    if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: No session found' });
  }


    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'New password and confirm password are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New passwords do not match' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    if (user.isGoogleAuthenticated) {
      return res.status(400).json({ error: 'Cannot change password for Google-authenticated account' });
    }

   

    user.password = newPassword;

    await user.save();

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
};


const otpCooldown = 60 * 1000; // 60 seconds

exports.sendCurrentEmailOtp = async (req, res) => {
  const userEmail = req.session.user?.email;

  if (!userEmail) {
    return res.status(400).json({ success: false, message: 'User not logged in' });
  }

  const now = Date.now();

  // Check cooldown
  if (req.session.currentEmailOtpTime && now - req.session.currentEmailOtpTime < otpCooldown) {
    return res.status(429).json({
      success: false,
      message: 'OTP already sent. Please wait a moment.',
    });
  }

  // Prevent multiple rapid sends
  if (req.session.otpLockUntil && now < req.session.otpLockUntil) {
    return res.status(429).json({
      success: false,
      message: 'OTP is already being sent. Please wait...',
    });
  }

  // Lock for a short window (e.g., 3 seconds)
  req.session.otpLockUntil = now + 3000;

  try {
    const otp = Math.floor(100000 + Math.random() * 900000);

    await sendOtpEmail(userEmail, otp);
    console.log('OTP:', otp);

    req.session.currentEmailOtp = otp;
    req.session.currentEmailOtpTime = now;

    res.json({ success: true, message: 'OTP sent to current email.' });
  } catch (error) {
    console.error('Send OTP error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to send OTP.' });
  }
};






exports.verifyCurrentEmailOtp = (req, res) => {
  const { otp } = req.body;
  const storedOtp = req.session.currentEmailOtp;
  const createdAt = req.session.currentEmailOtpTime;

  if(!otp){
      return res.status(400).json({ success: false, message: 'OTP  is required.' });

  }
  if (!storedOtp || !createdAt || Date.now() - createdAt > 60000) {
    return res.status(400).json({ success: false, message: 'OTP expired or not sent.' });
  }

  if (parseInt(otp) !== storedOtp) {
    return res.status(400).json({ success: false, message: 'Incorrect OTP.' });
  }

  req.session.currentEmailOtpVerified = true;
  res.json({ success: true, message: 'OTP verified successfully.' });
};


exports.sendNewEmailOtp = async (req, res) => {
  if (!req.session.currentEmailOtpVerified) {
        console.log(`error here`)

    return res.status(403).json({ success: false, message: 'Verify current email first.' });
  }

  const { email } = req.body;
  if(!email){
    console.log(`email not foun`)
  }
  newEmail=email;
  const otp = Math.floor(100000 + Math.random() * 900000);

  
  try {
    await sendOtpEmail(newEmail, otp);
    console.log(otp)
    req.session.newEmail = newEmail;
    req.session.newEmailOtp = otp;
    req.session.newEmailOtpTime = Date.now();
    res.json({ success: true, message: 'OTP sent to new email.' });
  } catch (error) {
    console.log(error)
    res.status(500).json({ success: false, message: 'Failed to send OTP.' });
  }
};

exports.verifyNewEmailOtp = async (req, res) => {
  const { otp } = req.body;
  const storedOtp = req.session.newEmailOtp;
  const createdAt = req.session.newEmailOtpTime;
  const newEmail = req.session.newEmail;
  const userId = req.session.user?.id;

  if(!otp){
        return res.status(400).json({ success: false, message: 'OTP is required' });

  }

  if (!storedOtp || !createdAt || Date.now() - createdAt > 60000) {
    return res.status(400).json({ success: false, message: 'OTP expired or not sent.' });
  }

  if (parseInt(otp) !== storedOtp) {
    return res.status(400).json({ success: false, message: 'Incorrect OTP.' });
  }

  try {
    await User.findByIdAndUpdate(userId, { email: newEmail });
    req.session.user.email = newEmail;
    delete req.session.newEmail;
    delete req.session.newEmailOtp;
    delete req.session.newEmailOtpTime;
    delete req.session.currentEmailOtp;
    delete req.session.currentEmailOtpTime;
    delete req.session.currentEmailOtpVerified;

    res.json({ success: true, message: 'Email updated successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update email.' });
  }
};
