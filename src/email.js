import { config } from './config.js';
    // Implement the email sending logic here, e.g., using an external email service API
    /**
     * 
     * Email sending configured for Amazon SES (SMTP interface)- but works with any SMTP-compatible email service
     * it uses standard SMTP protocol for sending emails.
     *  -PROD (EMAIL_*set): sends via SMTP using nodemailer 
     *  -DEV (EMAIL_* not set): logs the email content to the console instead of sending it.
     * Usage:
     *  EMAIL_HOST= email-smtp.<region>.amazonaws.com
     *  EMAIL_PORT= 587
     *  EMAIL_USER= your-smtp-username
     *  EMAIL_PASS= your-smtp-password
     *  EMAIL_FROM= your-email@example.com 
     */
    let cachedTransporter = null;
    let verifiedOnce = false;
    const smtpConfigured = () => {  return Boolean(config.email.host && config.email.user); };
    function logToConsole(to, subject, text, reason ) {
        console.log('\n'+'='.repeat(50));
        console.log(`[DEV EMAIL] ${reason}`);
        console.log(` To: ${to}`);
        console.log(` Subject: ${subject}`);
        console.log(` Text: ${text}`);
        console.log('='.repeat(50)+'\n');
    }
    async function getTransporter() {
        if (cachedTransporter) return cachedTransporter;
        const nodemailer = (await import('nodemailer')).default;
        
        const port = Number(config.email.port) || 587;
        console.log('inside getTransporter:1');
        console.log('config:'+JSON.stringify(config));
        cachedTransporter = nodemailer.createTransport({
            host: config.email.host,
            port: port,
            secure: port === 465,
            auth: { user: config.email.user, pass: config.email.password },
            tls:{minVersion: 'TLSv1.2'}
        });
                console.log('inside getTransporter:2');
        return cachedTransporter;
    }
    export async function sendPasswordResetEmail(to, token) {
        const url = `${config.frontEndUrl}/reset-password?token=${encodeURIComponent(token)}`;
        const subject = 'Reset your password';
        const text = `You requested a password reset. Click the following link to reset your password: ${url}` +
            ` This link will expire in 30 minutes. If you did not request this, please ignore this email.`;
        return await sendEmail({to, subject, text});
    }
    export async function sendEmail({to,subject,text}){
          console.log('inside sendEmail sending email:3');
        if (!smtpConfigured()){
            logToConsole(to, subject, text, 'SMTP is not properly configured');
            return { delivered: false, logged: true };
        }
        const transporter = await getTransporter();
        console.log('inside sendEmail sending email:4');
        //validate SMTP connection/credentials
        try {
            await transporter.verify();
            verifiedOnce = true;
            console.log(`smtp(ses) ready: ${config.email.host}:${config.email.port}`)
        } catch (error) {
            logToConsole(to, subject, text, `SMTP verification failed: ${error.message}`);
            return { delivered: false, logged: true };
        }
      console.log('inside sendEmail sending email:5');
        await transporter.sendMail({
            from: config.email.from,
            to,
            subject,
            text});
              console.log('inside sendEmail sending email:6');
        return {delivered: true, logged: false};
    }
 export async function sendVerificationEmail(to, token) { 
      console.log('inside sendverificationEmail sending email:2 to::'+to);

    const url = `${config.frontEndUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const subject = 'Verify your email address';
    const text = `Welcome to Organic Karunadu \n\n Please verify your email by clicking the following link: ${url}`+
    ` This link will expire in 30 minutes. If you did not request this, please ignore this email.`;
    return await sendEmail({to, subject, text});
}