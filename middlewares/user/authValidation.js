const User=require('../../models/userSchema')

exports.validateSignIn = (req, res, next) => {
  try {
    const { name, email ,password,Cpassword} = req.body;

   
    // Check if name and email are provided
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


    // Validate name field (stop at first error)
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

    
      
      // Validate password strength
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
        return null; // Valid password
      };
  
      const passwordError = validatePassword(password);
      if (passwordError) {
        return res.status(400).json({ errorType: "password", error: passwordError });
      }
      // Check if password and confirm password match
      if (password !== Cpassword) {
        return res.status(400).json({ errorType: "Cpassword", error: "Passwords do not match" });
      }

    // Proceed to the next middleware/controller
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

