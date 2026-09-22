import { Router } from "express";
import {db } from '../db.js';
import {toUser} from '../mapper.js';
import{asyncHandler, HttpError, genId} from '../util.js';

export const authRouter = Router();
authRouter.post('/login', asyncHandler ((req, res) => {
        const { email, password} = req.body || {};
        if(!email || !password) throw new HttpError(400, 'email and password are required');
        const row = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email);
        if(!row || row.password !== password) {
            throw new HttpError(401, 'Invalid email or password');
        }
        res.json({ok:true, user:toUser(row)});
}));

authRouter.post('/register', asyncHandler((req, res) => { 
   const {name, email, password} = req.body || {};
    if(!name || !email || !password) throw new HttpError(400, 'name, email and password are required');

    const exists = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(email);
    if(exists) throw new HttpError(409, 'An account with this email already exists.');

    const user = {id: genId('u'), name, email, password, role:'customer'};
    db.prepare('INSERT INTO users(id, name, email, password, role) VALUES (@id, @name, @password, @role)').run(user);
    res.status(201).json({ok:true,user:toUser(user)});
}));

authRouter.get('/users', asyncHandler((_req, res) => {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if(!row) throw new HttpError(404, 'User not found');
    res.json(toUser(row));
}));
authRouter.get('/users/:id', asyncHandler((req, res) => {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if(!row) throw new HttpError (404, 'User not found');
    res.json(toUser(row));
}))