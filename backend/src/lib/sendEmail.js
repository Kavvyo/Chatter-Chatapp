import nodemailer from 'nodemailer';

export const sendEmail = async (to, otp) => {
  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Chat App" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Verify Your Email',
    text: `Your OTP is ${otp}. It expires in 10 minutes.`,
  });
};
