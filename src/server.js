import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config.js';
import { initSchema } from './db.js';
import { seed } from './seed.js';
import {productsRouter} from './routes/products.js';
import {reviewsRouter} from './routes/reviews.js';
import { authRouter} from './routes/auth.js';
import { ordersRouter } from './routes/orders.js';
import { wishlistRouter} from './routes/wishlist.js';
import { HttpError } from './util.js';

initSchema();
seed();

const app = express();
app.use(cors({origin:config.corsOrigins}));
app.use(express.json({linmit:'2mb'}));
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => res.json({status:'ok',time: new Date().toISOString()}));

app.get('/api', (_req,res) => {

    res.json({
        name:'ecom-backend',
        endpoints: {
            products: [
                'GET /api/products',
                'GET /api/products/featured?count=4',
                'GET /api/products/meta/facets',
                'GET /api/products/:id',
                'POST /api/products',
                'PUT /api/products/:id',
                'PATCH /api/products/:id/decrement-stock',
                'DELETE /api/products/:id'
            ],
            reviews: [
                'GET /api/reviews?productId=',
                'GET /api/reviews/product/:productId',
                'POST /api/reviews'
            ],
            auth: [
                'POST /api/auth/login',
                'POST /api/auth/register',
                'GET /api/auth/users',
                'GET /api/auth/users/:id'
            ],
            orders: [
                'GET /api/orders?userId=',
                'GET /api/orders/:id',
                'POST /api/orders',
                'POST /api/orders/validate-coupon',
                'PATCH /api/orders/:id/status'
            ],
            wishlist: [
                'GET /api/wishlist/:userId',
                'GET /api/wishlist/:userId/products',
                'POST /api/wishlist/:userId/toggle',
                'DELETE /api/wishlist/:userId/:productId'
            ]
        }
    });
});
app.use('/api/products', productsRouter);
app.use('/api/reviews',reviewsRouter);
app.use('/api/auth',authRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/wishlist',wishlistRouter);
app.use((req, res) =>  {
    res.status(404).json({error:   `Not found: ${req.method} ${req.originalUrl}`});
});

app.use((err, _req, res, _next) => {
    const status = err instanceof HttpError ? err.status : 500;
    if(status >= 500)console.error(err);
    res.status(status).json({error:err.message || 'Internal server error'});
})
app.listen(config.port, () => {
    console.log(`ecom-backend listening on http://localhost:${config.port}`);
    console.log(`API index: http://localhost:${config.port}/api`)
})