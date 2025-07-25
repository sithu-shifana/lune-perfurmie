const mongoose=require('mongoose')

const connectDB=async()=>{
    try{
        if(!process.env.MONGO_URI){
            throw new Error('your mongodb atlas uri is missing in .env file')
        }
        const dbConnection=await mongoose.connect(process.env.MONGO_URI,{ //this connect your app to mongodb
            retryWrites:true,  //automatically retry
            w:'majority'  //wait for majory server makes copy
        })

        console.log(`mongoDB connected Succusfully`);

    }catch(error){
        console.error('❌ MongoDB connection failed:', error.message);
         process.exit(1);

    }
}


mongoose.connection.on('connected',()=>{
    console.log(`mongoose connected to mongodb`)
})

mongoose.connection.on('error',(err)=>{
    console.log(`mongodb connection error`,err)
})

mongoose.connection.on('disconnected',()=>{
    console.log(`mongoose disconnected`)
})


process.on(`SIGINT`, async () => {
  console.log(`shutting down gracefully....`);
  
  const mongooseConnection = mongoose.connection;
  try {
    await mongooseConnection.collection('sessions').deleteMany({});
    console.log("All sessions destroyed.");
  } catch (err) {
    console.log("Error deleting sessions:", err.message);
  }

  await mongoose.connection.close();
  process.exit(0);
});


module.exports = connectDB;
