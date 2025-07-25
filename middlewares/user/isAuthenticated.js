const User = require('../../models/userSchema'); 

const isAuthenticated = async (req, res, next) => {
    if (!req.session || !req.sessionID) {
        return res.redirect('/login?topError=' + encodeURIComponent('No active session. Please log in.'));
    }

    try {
        const user = await User.findBySessionID(req.sessionID);
        if (!user) {
            req.session.destroy();
            return res.redirect('/login?topError=' + encodeURIComponent('Session expired or invalid. Please log in.'));
        }

        if (user.isBlocked) {
            req.session.destroy();
            return res.redirect('/login?topError=' + encodeURIComponent('Blocked by admin.'));
        }

        req.user = { id: user._id, name: user.name, email: user.email, profilePicture: user.profilePicture };
        next();
    } catch (err) {
        console.error('Session check error:', err);
        return res.redirect('/login?topError=' + encodeURIComponent('Internal server error.'));
    }
};

module.exports = isAuthenticated;