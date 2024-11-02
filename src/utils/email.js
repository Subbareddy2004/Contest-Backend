const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

exports.sendWelcomeEmail = async (email, name, password) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Welcome to EyeLabs - Faculty Account Created',
      html: `
        <h1>Welcome to EyeLabs!</h1>
        <p>Dear ${name},</p>
        <p>Your faculty account has been created successfully.</p>
        <p>Here are your login credentials:</p>
        <ul>
          <li>Email: ${email}</li>
          <li>Password: ${password}</li>
        </ul>
        <p>Please change your password after your first login.</p>
        <p>Best regards,<br>EyeLabs Team</p>
      `
    });
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
}; 