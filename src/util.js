export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
let counter = 0;
export function genId(prefix) {
    counter = (counter+1) %1000;
    return `${prefix}${Date.now()}${counter.toString().padStart(3, '0')}`
}
export function round2(n) {
    return Math.round(n * 100)/100;
}