const express = require('express'); 
const session = require('express-session');
const dotenv = require('dotenv');
const connectDB = require('./config/db.js');
const MongoStore = require('connect-mongo'); 
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes.js');
const path = require('path');
const passport = require('passport');
const flash = require('connect-flash');
const http = require('http');
const { Server } = require('socket.io');

require('./config/passport');

dotenv.config();      
connectDB();            

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:8888",
    methods: ["GET", "POST"]
  }
});

app.set('io', io);


app.set('view engine', 'ejs');
app.set("views", [
  path.join(__dirname, "views/user"), 
  path.join(__dirname, "views")       
]);

app.use(session({
    secret: process.env.SESSION_SECRET || 'mysecret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        collectionName: 'sessions',
        ttl: 24 * 60 * 60, 
        autoRemove: 'native',
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, 
        secure: false,
        httpOnly: true 
    }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use((req, res, next) => {
  res.locals.user = req.session.user || null; 
  res.locals.admin = req.session.admin || null;
  next();
});


app.use('/', userRoutes); 
app.use('/admin', adminRoutes); 

app.use((req, res) => {
  res.status(404).render('404');
});


const PORT = process.env.PORT || 8888;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
