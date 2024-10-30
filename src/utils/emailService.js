const nodemailer = require('nodemailer');

// Create transporter using environment variables
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD // Use app-specific password for Gmail
  }
});

const sendWelcomeEmail = async (studentData) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: studentData.email,
      subject: 'Welcome to EyeLabs - Your Login Credentials',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Welcome to EyeLabs!</h2>
          <p>Hello ${studentData.name},</p>
          <p>Your account has been created by your faculty. Here are your login credentials:</p>
          <div style="background-color: #F3F4F6; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Username:</strong> ${studentData.email} or ${studentData.regNumber}</p>
            <p style="margin: 5px 0;"><strong>Password:</strong> ${studentData.regNumber}</p>
          </div>
          <p style="color: #EF4444;"><strong>Important:</strong> Please change your password after your first login for security purposes.</p>
          <p>You can login at: <a href="${studentData.loginUrl}">${studentData.loginUrl}</a></p>
          <p>If you have any issues logging in, please contact your faculty.</p>
          <p>Best regards,<br>EyeLabs Team</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Welcome email sent successfully to:', studentData.email);
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw error;
  }
};

module.exports = {
  sendWelcomeEmail
}; 