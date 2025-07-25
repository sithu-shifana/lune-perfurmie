const nodemailer = require('nodemailer');
require('dotenv').config(); 

const sendOtpEmail = async (email, otp) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"LUNE PERFUMIE" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Your OTP Code',
    html: `<p>Your OTP code is <b>${otp}</b>. It will expire in 1 minute.</p>`,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendOtpEmail;
