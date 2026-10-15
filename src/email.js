import nodemailer from 'nodemailer';
import { config } from './config.js';

let transporter;
function isConfigured() {
    return Boolean(config.email.host && config.email.port && config.email.user && config.email.password && config.frontendUrl);
}

function getTransporter() {
    transporter ??= nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: {
            user: config.email.user,
            pass: config.email.password
        }
    });
    return transporter;
}

export async function deliverVerificationEmail({ email, token }) {
    const verificationUrl = `${config.frontendUrl.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
    if (!isConfigured()) {
        return { delivered: false, verificationUrl };
    }
    await getTransporter().sendMail({
        from: config.email.user,
        to: email,
        subject: 'Verify your Organic Karunadu email',
        text: `Please verify your email address using this link: ${verificationUrl}`
    });
    return { delivered: true };
}
