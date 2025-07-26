const mongoose=require('mongoose')

const connectDB = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error('Your MongoDB Atlas URI is missing in .env file');
        }
        const dbConnection = await mongoose.connect(process.env.MONGO_URI, {
            retryWrites: true,
            w: 'majority',
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10, // Allow 10 concurrent connections
            minPoolSize: 2   // Keep at least 2 connections open
        });
        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        process.exit(1);
    }
};


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
  
  // Clear all sessions
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
