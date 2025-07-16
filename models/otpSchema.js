const mongoose=require('mongoose')
const otpSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    otp: {
        type: String,
        required: true
    },
    
    expiresAt: {
        type: Date,
        required: true,
        default: function() {
            return new Date(Date.now() + 1 * 60 * 1000); // 1 minute from now
        }
    }
}, {
    timestamps: true
});

// Auto-delete expired OTPs
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for user lookup
otpSchema.index({ userId: 1 });

const OTP = mongoose.model('OTP', otpSchema);
export default OTP;