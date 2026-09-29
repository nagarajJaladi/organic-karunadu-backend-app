import { Router } from 'express'; 
import { db} from'../db.js';
import { toProduct } from '../mapper.js';
import { requireAdmin, requireAuth } from '../auth-middleware.js';
import { asyncHandler, HttpError, genId} from '../util.js';

export const productsRouter = Router ();

const SORTS = {
'price-asc': 'price ASC',
'price-desc': 'price DESC',
'rating-desc': ' rating DESC',
'name-asc': 'name COLLATE NOCASE ASC'
};
// GET /api/products (supports search, category, brand, minPrice, maxPrice, sort)
productsRouter.get ('/', asyncHandler(async (req, res) => { 
    const { search, category, brand, minPrice, maxPrice, sort } = req.query;
    const where = [];
    const params = [];
    if (search) {
        params.push(`%${search}%`);
        where.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length} OR brand ILIKE $${params.length})`);
    }
    if(category) { params.push(category); where.push(`category = $${params.length}`); }
    if(brand) { params.push(brand); where.push(`brand = $${params.length}`); }
    if(minPrice != null && minPrice !== '') { params.push(Number(minPrice)); where.push(`price >= $${params.length}`); }
    if(maxPrice != null && maxPrice !== '') { params.push(Number(maxPrice)); where.push(`price <= $${params.length}`); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}`: '';
    const orderSql = SORTS[sort] ? `ORDER BY ${SORTS[sort]}` :'';
    const { rows } = await db.query(`SELECT * FROM products ${whereSql} ${orderSql}`, params);
    res.json(rows.map(toProduct));
}));

//distinct categories and brands
productsRouter.get('/meta/facets', asyncHandler(async (__req, res) => {
    const categories = (await db.query('SELECT DISTINCT category FROM products ORDER BY category')).rows.map((r)=> r.category);
    const brands = (await db.query('SELECT DISTINCT brand FROM products ORDER BY brand')).rows.map((r)=> r.brand);
    res.json({categories, brands});
}));
// /api/products/featured?count=4
productsRouter.get('/featured', asyncHandler(async (req,res) => {
    const count = Number(req.query.count) || 4;
    const { rows } = await db.query('SELECT * FROM products ORDER BY rating DESC LIMIT $1', [count]);
    res.json(rows.map(toProduct));
}))
productsRouter.get('/:id', asyncHandler(async (req, res) => {
    const { rows } = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const row = rows[0];
    if(!row) throw new HttpError(404, 'Product not found');
    res.json(toProduct(row));
}));
// post /api/products
productsRouter.post('/', requireAuth, requireAdmin, asyncHandler(async (req,res) => {
    const {name, description='', price=0,category='',brand='',image='',stock=0} = req.body ||{};
    if(!name) throw new HttpError(400, 'name is required');
    const product = {
        id: genId('p'),
        name,description, price: Number(price), category, brand, image, stock: Number(stock), rating:0, ratingCount:0
    };
    await db.query(`INSERT INTO products (id, name, description, price, category, brand, image, stock, rating, rating_count)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0)`,
        [product.id, product.name, product.description, product.price, product.category, product.brand, product.image, product.stock]);
        res.status(201).json(toProduct(product));
}));
// /api/produts/:id (partial update)
productsRouter.put('/:id', requireAuth, requireAdmin, asyncHandler(async (req,res) => {
    const existing = await db.query('SELECT * FROM products WHERE id=$1', [req.params.id]);
    if(!existing.rowCount) throw new HttpError(404, 'Product not found');
    if(!existing) throw new HttpError(404, 'Product not found');
    const fieldMap = {
        name: 'name', description:'description', price:'price', category:'category',
        brand: 'brand', image: 'image', stock:'stock', rating:'rating', ratingCount:'rating_count'
    };
    const sets = [];
    const params = [];
    for(const [key, col] of Object.entries(fieldMap)){
        if(req.body[key]!== undefined) {
            params.push(req.body[key]);
            sets.push(`${col}= $${params.length}`);
        }
    }
    if(sets.length) {
        params.push(req.params.id);
        await db.query(`UPDATE products SET ${sets.join(', ')} WHERE id= $${params.length}`, params);
    }
    const { rows } = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    const row = rows[0];
    res.json(toProduct(row));
}));
productsRouter.delete('/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const info = await db.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    if (!info.rowCount) throw new HttpError(404, 'Product not found');
    res.status(204).end();
}));
productsRouter.patch('/:id/decrement-stock', requireAuth, requireAdmin, asyncHandler(async (req, res) =>{
    const quantity = Number(req.body?.quantity);
    const { rows } = await db.query('UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2 RETURNING *', [quantity, req.params.id]);
    if(!rows[0]) throw new HttpError(404, 'Product not found');
    res.json(toProduct(rows[0]));
}))


