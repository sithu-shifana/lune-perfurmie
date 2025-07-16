const mongoose=require('mongoose');
const Schema=mongoose.Schema;

const walletSchema=new Schema({
    user:{
        type:Schema.Types.ObjectId,
        ref:'User',
        required:true,
        unique:true
    },
    balance:{
        type:Number,
        required:true,
        default:0,
        min:[0,'Balance cannot be less than 0']
    },transactions:[{
        type:{
            type:String,
            enum:['credit','debit'],
            required:true
        },
        amount:{
            type:Number,
            required:true,
            min: [0, 'Transaction amount must be positive']

        },
        description:{
            type:String,
            trim:true,
            default:''
        },
        status: {
           type: String,
           enum: ['completed', 'failed'],
           default: 'completed'
        },
        TransactionTime:{
            type:Date,
            default:Date.now
        }
    }]
    
},{
    timestamps:true
})

walletSchema.statics.getOrCreate = async function(userId) {
    try {
        let wallet = await this.findOne({ user: userId });
        
        if (!wallet) {
            wallet = new this({
                user: userId,
                balance: 0,
                transactions: []
            });
            await wallet.save();
            console.log(`New wallet created for user: ${userId}`);
        }
        
        return wallet;
    } catch (error) {
        console.error('Error in getOrCreate:', error);
        throw error;
    }
};

//method to add Money to wallet
walletSchema.methods.addMoney=async function(amount,description=''){
    this.balance+=amount;
    this.transactions.push({
        type:'credit',
        amount,
        description
    })
    await this.save();
    return this;
}

//await wallet.addMoney(500, "Added from bank");


//deduct money
walletSchema.methods.deductMoney=async function(amount,description=''){
    this.balance-=amount;
    this.transactions.push({
         type:'debit',
        amount,
        description
    })
    await this.save();
    return this;
}

module.exports = mongoose.model('Wallet', walletSchema);
