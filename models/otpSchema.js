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
            return new Date(Date.now() + 1 * 60 * 1000); 
        }
    }
}, {
    timestamps: true
});

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

otpSchema.index({ userId: 1 });

const OTP = mongoose.model('OTP', otpSchema);
export default OTP;