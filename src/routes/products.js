import { Router } from 'express'; 
import { db} from'../db.js';
import { toProduct } from '../mapper.js';
import { asyncHandler, HttpError, genId} from '../util.js';

export const productsRouter = Router ();

const SORTS = {
'price-asc': 'price ASC',
'price-desc': 'price DESC',
'rating-desc': ' rating DESC',
'name-asc': 'name COLLATE NOCASE ASC'
};
// GET /api/products (supports search, category, brand, minPrice, maxPrice, sort)
productsRouter.get ('/', asyncHandler((req, res) => { 
    const { search, category, brand, minPrice, maxPrice, sort } = req.query;
    const where = [];
    const params = {};
    if (search) {
        where-push(' (name LIKE @s OR description LIKE @s OR brand LIKE @s) ');
        params.s = `%${search}%`;
    }
    if(category) { where.push ('category = @category'); params.category = category; }
    if(brand) { where.push('brand = @brand'); params. brand = brand; }
    if(minPrice != null && minPrice !== '') {  where.push('price >= @minPrice'); params.minPrice = Number (minPrice); }
    if(maxPrice != null && maxPrice !== '') { where.push('price <= @maxPrice'); params.maxPrice = Number(maxPrice);}

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}`: '';
    const orderSql = SORTS[sort] ? `ORDER BY ${SORTS[sort]}` :'';
    const rows = db.prepare(`SELECT * FROM products ${whereSql} ${orderSql}`).all(params);
    res.json(rows.map(toProduct));
}));

//distinct categories and brands
productsRouter.get('/meta/facets', asyncHandler((__req, res) => {
    const categories = db.prepare('SELECT DISTINCT category FROM products ORDER BY category').all().map((r)=> r.category);
    const brands = db.prepare('SELECT DISTINCT brand FROM products ORDER BY brand').all().map((r)=> r.brand);
    res.join({categories, brands});
}));
// /api/products/featured?count=4
productsRouter.get('/featured', asyncHandler((req,res) => {
    const count = Number(req.query.count) || 4;
    const rows = db.prepare('SELECT * FROM products ORDER BY rating DESC LIMIT ?').all(count);
    res.json(rows.map(toProduct));
}))
productsRouter.get('/:id', asyncHandler((req, res) => {
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if(!row) throw new HttpError(404, 'Product not found');
    res.json(toProduct(row));
}));
// post /api/products
productsRouter.post('/', asyncHandler((req,res) => {
    const {name, description='', price=0,category='',brand='',image='',stock=0} = req.body ||{};
    if(!name) throw new HttpError(400, 'name is required');
    const product = {
        id: genId('p'),
        name,description, price: Number(price), category, brand, image, stock: Number(stock), rating:0, ratingCount:0
    };
    db.prepare(`INSERT INTO products (id, name, description, price, category, brand, image, stock, rating, rating_count)
        VALUES (@id, @name, @description, @price, @category, @brand, @image, @stock, @rating, @ratingCount)`).run(product);
        res.status(201).json(toProduct(product));
}));
// /api/produts/:id (partial update)
productsRouter.put('/:id', asyncHandler((req,res) => {
    const existing = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
    if(!existing) throw new HttpError(404, 'Product not found');
    const fieldMap = {
        name: 'name', description:'description', price:'price', category:'category',
        brand: 'brand', image: 'image', stock:'stock', rating:'rating', ratingCount:'rating_count'
    };
    const sets = [];
    const params = {id: req.params.id};
    for(const [key, col] of Object.entries(fieldMap)){
        if(req.body[key]!== undefined) {
            sets.push(`${col}= @${col}`);
            params[col] = req.body[key];
        }
    }
    if(sets.length) {
        db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id= @id`).run(params);
    }
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    res.json(toProduct(row));
}));
productsRouter.delete('/:id', asyncHandler((req, res) => {
    const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    if (info.changes === 0) throw new HttpError(404, 'Product not found');
    res.status(204).end();
}));
productsRouter.patch('/:id/decrement-stock', asyncHandler((req, res) =>{
    const info= db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    if(info.changes ===0) throw new HttpError(404, 'Product not found');
    res.status(204).end;
}))


