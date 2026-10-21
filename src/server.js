import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config.js';
import { initSchema } from './db.js';
import { seed } from './seed.js';
import {categoriesRouter, productsRouter} from './routes/products.js';
import {reviewsRouter} from './routes/reviews.js';
import { authRouter} from './routes/auth.js';
import { ordersRouter } from './routes/orders.js';
import { adminOrdersRouter } from './routes/admin-orders.js';
import { deliveryRouter, adminDeliveryRouter } from './routes/delivery.js';
import { wishlistRouter} from './routes/wishlist.js';
import { HttpError } from './util.js';

if (!config.jwtSecret) throw new Error('JWT_SECRET must be set in the backend environment');

await initSchema();
await seed();

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
                'GET /api/auth/users/:id',
                'POST /api/auth/forgot-password',
                'POST /api/auth/reset-password',
                'POST /api/auth/resend-verification'
            ],
            orders: [
                'GET /api/admin/orders?page=&pageSize=&search=&status=&paymentStatus=&from=&to=',
                'GET /api/admin/orders/:id',
                'GET /api/admin/orders/:id/history',
                'GET /api/admin/orders/:id/invoice',
                'PATCH /api/admin/orders/:id/status',
                'POST /api/admin/orders/:id/cancel',
                'GET /api/orders?userId=',
                'GET /api/orders/:id',
                'POST /api/orders',
                'POST /api/orders/validate-coupon',
                'PATCH /api/orders/:id/status'
            ],
            delivery: [
                'GET /api/delivery/check/:pincode',
                'GET /api/admin/delivery/pincodes?search=',
                'POST /api/admin/delivery/pincodes',
                'PATCH /api/admin/delivery/pincodes/:pincode'
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
app.use('/api/categories', categoriesRouter);
app.use('/api/reviews',reviewsRouter);
app.use('/api/auth',authRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/admin/orders', adminOrdersRouter);
app.use('/api/delivery', deliveryRouter);
app.use('/api/admin/delivery', adminDeliveryRouter);
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