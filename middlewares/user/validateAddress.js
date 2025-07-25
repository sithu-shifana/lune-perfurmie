
const validateAddress = (req, res, next) => {
  const { name, phone, street, city, state, pinCode, country } = req.body;
  const errors = {};

  if (!name?.trim()) errors.name = "Name is required";
  if (name?.trim() && name.trim()[0] !== name.trim()[0].toUpperCase()) {
  errors.name = "First letter of name should be capital";
}
  if (!phone?.trim()) errors.phone = "Phone number is required";
  if (!street?.trim()) errors.street = "Street is required";
  if (!city?.trim()) errors.city = "City is required";
  if (!state?.trim()) errors.state = "State is required";
  if (!pinCode?.trim()) errors.pinCode = "Pin Code is required";
  if (!country?.trim()) errors.country = "Country is required";

if (phone) {
    const cleanedPhone = phone.replace(/\s+/g, "").replace(/^(\+91)/, ""); 
    if (!/^\d{10}$/.test(cleanedPhone)) {
      errors.phone = "Phone must be exactly 10 digits (with or without +91 or spaces)";
    } else {
      req.body.phone = cleanedPhone;
    }
  }  
  if (pinCode && !/^\d{6}$/.test(pinCode)) errors.pinCode = "Pin Code must be 6 digits";

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  next(); 
};

module.exports=validateAddress;
