import { Router } from 'express'; 
import { db} from'../db.js';
import { toProduct } from '../mapper.js';
import { requireAdmin, requireAuth } from '../auth-middleware.js';
import { asyncHandler, HttpError, genId} from '../util.js';

export const productsRouter = Router ();

const SORTS = {
'price-asc': 'p.price ASC',
'price-desc': 'p.price DESC',
'rating-desc': 'p.rating DESC',
'name-asc': 'p.name ASC'
};
const PRODUCT_SELECT = `SELECT p.*,
    COALESCE(array_agg(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL), ARRAY[]::text[]) AS additional_images
    FROM products p LEFT JOIN product_images pi ON pi.product_id = p.id`;

async function loadProduct(id, client = db) {
    const { rows } = await client.query(`${PRODUCT_SELECT} WHERE p.id = $1 GROUP BY p.id`, [id]);
    return rows[0] ?? null;
}

function normalizeAdditionalImages(images) {
    if (images === undefined) return undefined;
    if (!Array.isArray(images) || images.some((image) => typeof image !== 'string')) {
        throw new HttpError(400, 'additionalImages must be an array of image URLs');
    }
    return [...new Set(images.map((image) => image.trim()).filter(Boolean))];
}
// GET /api/products (supports search, category, brand, minPrice, maxPrice, sort)
productsRouter.get ('/', asyncHandler(async (req, res) => { 
    const { search, category, brand, minPrice, maxPrice, sort } = req.query;
    const where = [];
    const params = [];
    if (search) {
        params.push(`%${search}%`);
        where.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length} OR p.brand ILIKE $${params.length})`);
    }
    if(category) { params.push(category); where.push(`p.category = $${params.length}`); }
    if(brand) { params.push(brand); where.push(`p.brand = $${params.length}`); }
    if(minPrice != null && minPrice !== '') { params.push(Number(minPrice)); where.push(`p.price >= $${params.length}`); }
    if(maxPrice != null && maxPrice !== '') { params.push(Number(maxPrice)); where.push(`p.price <= $${params.length}`); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}`: '';
    const orderSql = SORTS[sort] ? `ORDER BY ${SORTS[sort]}` :'';
    const { rows } = await db.query(`${PRODUCT_SELECT} ${whereSql} ${orderSql} GROUP BY p.id`, params);
    res.json(rows.map(toProduct));
}));

//distinct categories and brands
productsRouter.get('/meta/facets', asyncHandler(async (__req, res) => {
    const categories = (await db.query('SELECT DISTINCT category FROM products ORDER BY category')).rows.map((r)=> r.category);
    const brands = (await db.query('SELECT DISTINCT brand FROM products ORDER BY brand')).rows.map((r)=> r.brand);
    res.json({categories, brands});
}));
productsRouter.get('/categories', asyncHandler(async (_req, res) => {
    const { rows } = await db.query('SELECT id, name FROM categories ORDER BY name');
    res.json(rows);
}));
// /api/products/featured?count=4
productsRouter.get('/featured', asyncHandler(async (req,res) => {
    const count = Number(req.query.count) || 4;
    const { rows } = await db.query(`${PRODUCT_SELECT} GROUP BY p.id ORDER BY p.rating DESC LIMIT $1`, [count]);
    res.json(rows.map(toProduct));
}))
productsRouter.get('/:id/images', asyncHandler(async (req, res) => {
    const { rows } = await db.query(`
        SELECT p.image,
            COALESCE(array_agg(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.id IS NOT NULL), ARRAY[]::text[]) AS additional_images
        FROM products p
        LEFT JOIN product_images pi ON pi.product_id = p.id
        WHERE p.id = $1
        GROUP BY p.id`, [req.params.id]);
    if (!rows[0]) throw new HttpError(404, 'Product not found');
    const images = [...new Set([rows[0].image, ...rows[0].additional_images].filter(Boolean))];
    res.json(images);
}));
productsRouter.get('/:id', asyncHandler(async (req, res) => {
    const row = await loadProduct(req.params.id);
    if(!row) throw new HttpError(404, 'Product not found');
    res.json(toProduct(row));
}));
// post /api/products
productsRouter.post('/', requireAuth, requireAdmin, asyncHandler(async (req,res) => {
    const { name, description = '', price = 0, categoryId, brand = '', image = '', stock = 0 } = req.body || {};
    const additionalImages = normalizeAdditionalImages(req.body?.additionalImages) ?? [];
    if(!name) throw new HttpError(400, 'name is required');
    if (!categoryId) throw new HttpError(400, 'categoryId is required');
    const categoryResult = await db.query('SELECT id, name FROM categories WHERE id = $1', [categoryId]);
    const selectedCategory = categoryResult.rows[0];
    if (!selectedCategory) throw new HttpError(400, 'Selected category does not exist');
    const product = {
        id: genId('p'),
        name, description, price: Number(price), category: selectedCategory.name,
        categoryId: selectedCategory.id, brand, image, stock: Number(stock), rating: 0, ratingCount: 0
    };
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO products
            (id, name, description, price, category, category_id, brand, image, stock, rating, rating_count)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0)`,
            [product.id, product.name, product.description, product.price, product.category, product.categoryId,
                product.brand, product.image, product.stock]);
        for (const [index, imageUrl] of additionalImages.entries()) {
            await client.query('INSERT INTO product_images (product_id, image_url, sort_order) VALUES ($1, $2, $3)',
                [product.id, imageUrl, index + 1]);
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
    res.status(201).json(toProduct(await loadProduct(product.id)));
}));
// /api/produts/:id (partial update)
productsRouter.put('/:id', requireAuth, requireAdmin, asyncHandler(async (req,res) => {
    const existing = await db.query('SELECT * FROM products WHERE id=$1', [req.params.id]);
    if(!existing.rowCount) throw new HttpError(404, 'Product not found');
    if(!existing) throw new HttpError(404, 'Product not found');
    const fieldMap = {
        name: 'name', description:'description', price:'price',
        brand: 'brand', image: 'image', stock:'stock', rating:'rating', ratingCount:'rating_count'
    };
    const sets = [];
    const params = [];
    const additionalImages = normalizeAdditionalImages(req.body.additionalImages);
    if (req.body.categoryId !== undefined) {
        const categoryResult = await db.query('SELECT id, name FROM categories WHERE id = $1', [req.body.categoryId]);
        const selectedCategory = categoryResult.rows[0];
        if (!selectedCategory) throw new HttpError(400, 'Selected category does not exist');
        params.push(selectedCategory.name);
        sets.push(`category = $${params.length}`);
        params.push(selectedCategory.id);
        sets.push(`category_id = $${params.length}`);
    }
    for(const [key, col] of Object.entries(fieldMap)){
        if(req.body[key]!== undefined) {
            params.push(req.body[key]);
            sets.push(`${col}= $${params.length}`);
        }
    }
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        if (sets.length) {
            params.push(req.params.id);
            await client.query(`UPDATE products SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
        }
        if (additionalImages !== undefined) {
            await client.query('DELETE FROM product_images WHERE product_id = $1', [req.params.id]);
            for (const [index, imageUrl] of additionalImages.entries()) {
                await client.query('INSERT INTO product_images (product_id, image_url, sort_order) VALUES ($1, $2, $3)',
                    [req.params.id, imageUrl, index + 1]);
            }
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
    res.json(toProduct(await loadProduct(req.params.id)));
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


