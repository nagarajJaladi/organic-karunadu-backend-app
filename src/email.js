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
        const nodemailer = await import('nodemailer').default;
        
        const port = Number(config.email.port) || 587;

        cachedTransporter = nodemailer.createTransport({
            host: config.email.host,
            port: port,
            secure: port === 465,
            auth: { user: config.email.user, pass: config.email.password },
            tls:{minVersion: 'TLSv1.2'}
        });
        return cachedTransporter;
    }
    export async function sendEmail({to,subject,text}){
        if (!smtpConfigured()){
            logToConsole(to, subject, text, 'SMTP is not properly configured');
            return { delivered: false, logged: true };
        }
        const transporter = await getTransporter();

        //validate SMTP connection/credentials
        try {
            await transporter.verify();
            verifiedOnce = true;
            console.log(`smtp(ses) ready: ${config.email.host}:${config.email.port}`)
        } catch (error) {
            logToConsole(to, subject, text, `SMTP verification failed: ${error.message}`);
            return { delivered: false, logged: true };
        }
    
        await transporter.sendMail({
            from: config.email.from,
            to,
            subject,
            text});
        return {delivered: true, logged: false};
    }
 export async function sendVerificationEmail(to, token) { 
    const url = `${config.frontEndUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const subject = 'Verify your email address';
    const text = `Welcome to Organic Karunadu \n\n Please verify your email by clicking the following link: ${url}`+
    `This link will expire in 30 minutes. If you did not request this, please ignore this email.`;
    return await sendEmail({to, subject, text});
}