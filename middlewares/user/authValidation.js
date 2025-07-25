const User=require('../../models/userSchema')

exports.validateSignIn = (req, res, next) => {
  try {
    const { name, email ,password,Cpassword} = req.body;

   
    if (!name && !email&&!password&&!Cpassword) {
      return res.status(400).json({ errorType: "top", error: "Fill all credentials" });
    }
    if (!name) {
      return res.status(400).json({ errorType: "name", error: "Name is required" });
    }
    if (!email) {
      return res.status(400).json({ errorType: "email", error: "Email is required" });
    }
    if (!password) {
      return res.status(400).json({ errorType: "password", error: "Password is required" });
    }
    if (!Cpassword) {
      return res.status(400).json({ errorType: "Cpassword", error: "Confirm Password is required" });
    }
    if (name[0] !== name[0].toUpperCase()) {
    return res.status(400).json({ errorType: "name", error: "First letter of name should be capital" });
    }


    if (name.length < 5) {
      return res.status(400).json({ errorType: "name", error: "Name must be at least 5 characters" });
    }
    if (!/[a-zA-Z]/.test(name)) {
      return res.status(400).json({ errorType: "name", error: "Name must contain Characters" });
    }
    if (/^\d/.test(name)) {
      return res.status(400).json({ errorType: "name", error: "Name cannot start with number" });
    }
    if (/[?<>\[\];@!#$%^&*()_+=]/.test(name)) {
      return res.status(400).json({ errorType: "name", error: "No special characters allowed" });
    }

    
      
      const validatePassword = (password) => {
        const minLength = 6;
        const upperCase = /[A-Z]/;
        const lowerCase = /[a-z]/;
        const digit = /\d/;
        const specialChar = /[!@#$%^&*(),.?":{}|<>]/;
  
        if (password.length < minLength) {
          return "Password must be at least 6 characters long.";
        }
        if (!upperCase.test(password)) {
          return "Password must contain at least one uppercase letter.";
        }
        if (!lowerCase.test(password)) {
          return "Password must contain at least one lowercase letter.";
        }
        if (!digit.test(password)) {
          return "Password must contain at least one digit.";
        }
        if (!specialChar.test(password)) {
          return "Password must contain at least one special character.";
        }
        return null; 
      };
  
      const passwordError = validatePassword(password);
      if (passwordError) {
        return res.status(400).json({ errorType: "password", error: passwordError });
      }
      if (password !== Cpassword) {
        return res.status(400).json({ errorType: "Cpassword", error: "Passwords do not match" });
      }

    next();
  } catch (err) {
    console.error("Validation error:", err);
    res.status(500).json({ errorType: "top", error: "Server error occurred during validation" });
  }
};

exports.validateLogin = (req, res, next) => {
  try {
    const {  email ,password} = req.body;

    if (!email&&!password) {
      return res.status(400).json({ errorType: "top", error: " credentials is missing" });
    }
    
    if (!email) {
      return res.status(400).json({ errorType: "email", error: "Email is required" });
    }
    if (!password) {
      return res.status(400).json({ errorType: "password", error: "Password is required" });
    }
    
    next();
  } catch (err) {
    console.error("Validation error in Login:", err);
    res.status(500).json({ errorType: "top", error: "Server error occurred during validation" });
  }
};

