const express = require('express'); 
const session = require('express-session');
const dotenv = require('dotenv');
const connectDB = require('./config/db.js');
const MongoStore = require('connect-mongo'); 
const userRoutes = require('./routes/userRoutes');
const adminRoutes=require('./routes/adminRoutes.js')
const path = require('path');
const passport = require('passport');
const flash = require('connect-flash');

require('./config/passport');


dotenv.config();           // Load environment variables
connectDB();               // Connect to MongoDB

const app = express();

// View engine setup
app.set('view engine', 'ejs');
app.set("views", [
  path.join(__dirname, "views/user"),  // user views folder
  path.join(__dirname, "views")        // general views folder
]);

// Session setup using connect-mongo (auto-expire sessions)
app.use(session({
  secret: process.env.SESSION_SECRET || 'mysecret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60, // 1 day in seconds
    autoRemove: 'native', // auto-remove expired sessions
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 1 day in milliseconds
  }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"))); // static files
app.use((req, res, next) => {
  res.locals.user = req.session.user || null; // send session user to views
  res.locals.admin = req.session.admin || null;
  next();
});

// Routes


app.use('/', userRoutes); 
app.use('/admin', adminRoutes); 

app.use((req, res) => {
  res.status(404).render('404');
});

// Start server
const PORT = process.env.PORT || 8888;
app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
});
