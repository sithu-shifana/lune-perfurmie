const mongoose=require('mongoose')
const bcrypt=require('bcrypt');
const walletSchema = require('./walletSchema');
const shortid = require('shortid');
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    
    email: {
        type: String,
        required: true,
        unique:true,
        trim: true,
        lowercase: true
    },
    
    phone: {
        type: String,
        required: false,
        trim: true
    },
    
    password: {
        type: String,
        required: function() {
            return !this.isGoogleAuthenticated; 
        }
    },
    
    isGoogleAuthenticated: {
        type: Boolean,
        default: false
    },
    
    googleId: {
        type: String,
        unique: true,
        sparse: true // Allows multiple null values but unique non-null values
    },
    
    profilePicture: {
        type: String,
        default: ''
    },
    
      isBlocked: {
        type: Boolean,
        default: false
    },
    
    
    sessionID: {
        type: String,
        default: null
    },
    
    lastLogin: {
        type: Date,
        default: null
    },
    
    isOnline: {
        type: Boolean,
        default: false
    },  referralCode: {
        type: String,
        unique: true,
        sparse: true
    },
    
    referredBy: {
        type: String,
        default: null
    },
    
    referralReward: {
        type: Number,
        default: 0
    },
}, {
    timestamps: true // Automatically adds createdAt and updatedAt
});

// Add this to userSchema.js
// Generate unique referral code before saving
userSchema.pre('save', async function(next) {
    if (this.isNew && !this.referralCode) {
        let referralCode;
        let isUnique = false;

        while (!isUnique) {
            referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            const existingUser = await this.constructor.findOne({ referralCode });
            if (!existingUser) {
                isUnique = true;
            }
        }

        this.referralCode = referralCode;
    }
    next();
});

// Hash password before saving (only if password exists)
userSchema.pre('save', async function(next) {
    if (!this.isModified('password') || !this.password) return next();
    
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Method to handle login session
userSchema.methods.createSession = async function(sessionID) {
    this.sessionID = sessionID;
    this.lastLogin = new Date();
    this.isOnline = true;
    await this.save();
};

// Method to handle logout
userSchema.methods.clearSession = async function() {
    this.sessionID = null;
    this.isOnline = false;
    await this.save();
};

// Static method to find user by session ID
userSchema.statics.findBySessionID = function(sessionID) {
    return this.findOne({ sessionID, isOnline: true });
};



module.exports = mongoose.model('User', userSchema);
