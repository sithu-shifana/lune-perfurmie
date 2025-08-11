const validateAddress = (req, res, next) => {
  
  const { name, phone, street, city, state, pinCode, country } = req.body;
  const errors = {};
  
  const validIndianStates = [
    'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh',
    'goa', 'gujarat', 'haryana', 'himachal pradesh', 'jharkhand', 'karnataka',
    'kerala', 'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya',
    'mizoram', 'nagaland', 'odisha', 'punjab', 'rajasthan', 'sikkim',
    'tamil nadu', 'telangana', 'tripura', 'uttar pradesh', 'uttarakhand',
    'west bengal', 'andaman and nicobar islands', 'chandigarh',
    'dadra and nagar haveli and daman and diu', 'delhi', 'jammu and kashmir',
    'ladakh', 'lakshadweep', 'puducherry'
  ];

  if (!name?.trim()) {
    errors.name = "Name is required";
  } else {
    const trimmedName = name.trim();
    const nameErrors = [];
    
    if (trimmedName[0] !== trimmedName[0].toUpperCase()) {
      nameErrors.push("First letter of name should be capital");
    }
    
    if (!/^[A-Za-z\s]+$/.test(trimmedName)) {
      nameErrors.push("Name should contain only alphabets and spaces");
    }
    
    if (nameErrors.length > 0) {
      errors.name = nameErrors.join(", ");
    }
  }

  if (!phone?.trim()) {
    errors.phone = "Phone number is required";
  } else {
    const phoneErrors = [];
    const cleanedPhone = phone.replace(/\s+/g, "").replace(/^(\+91)/, ""); 
    
    if (!/^\d{10}$/.test(cleanedPhone)) {
      phoneErrors.push("Phone must be exactly 10 digits (with or without +91 or spaces)");
    }
    
    if (/[^0-9+\s]/.test(phone)) {
      phoneErrors.push("Phone should not contain special characters except +91");
    }
    
    if (phoneErrors.length > 0) {
      errors.phone = phoneErrors.join(", ");
    } else {
      req.body.phone = cleanedPhone;
    }
  }

  if (!street?.trim()) {
    errors.street = "Street is required";
  } else {
    const streetErrors = [];
    const trimmedStreet = street.trim();
    
    if (!/^[A-Za-z0-9\s]+$/.test(trimmedStreet)) {
      streetErrors.push("Street should contain only alphabets, numbers, and spaces");
    }
    
    if (streetErrors.length > 0) {
      errors.street = streetErrors.join(", ");
    }
  }

  if (!city?.trim()) {
    errors.city = "City is required";
  } else {
    const cityErrors = [];
    const trimmedCity = city.trim();
    
    if (!/^[A-Za-z\s]+$/.test(trimmedCity)) {
      cityErrors.push("City should contain only alphabets and spaces");
    }
    
    if (cityErrors.length > 0) {
      errors.city = cityErrors.join(", ");
    }
  }

  if (!state?.trim()) {
    errors.state = "State is required";
  } else {
    const stateErrors = [];
    const trimmedState = state.trim();
    const normalizedState = trimmedState.toLowerCase();
    
    if (!/^[A-Za-z\s]+$/.test(trimmedState)) {
      stateErrors.push("State should contain only alphabets and spaces");
    }
    
    if (!validIndianStates.includes(normalizedState)) {
      stateErrors.push("Please enter a valid Indian state or union territory");
    }
    
    if (stateErrors.length > 0) {
      errors.state = stateErrors.join(", ");
    }
  }

  if (!pinCode?.trim()) {
    errors.pinCode = "Pin Code is required";
  } else {
    const pinCodeErrors = [];
    const trimmedPinCode = pinCode.trim();
    
    if (!/^\d{6}$/.test(trimmedPinCode)) {
      pinCodeErrors.push("Pin Code must be exactly 6 digits");
    }
    
    if (pinCodeErrors.length > 0) {
      errors.pinCode = pinCodeErrors.join(", ");
    }
  }

  if (!country?.trim()) {
    errors.country = "Country is required";
  } else {
    const countryErrors = [];
    const trimmedCountry = country.trim();
    
    if (!/^[A-Za-z\s]+$/.test(trimmedCountry)) {
      countryErrors.push("Country should contain only alphabets and spaces");
    }
    
    if (countryErrors.length > 0) {
      errors.country = countryErrors.join(", ");
    }
  }

  console.log('Validation errors found:', errors);

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  next(); 
};

module.exports = validateAddress;