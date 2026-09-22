import {db, initSchema} from './db.js'
import {SEED_PRODUCTS, SEED_REVIEWS, SEED_USERS} from './seed-data.js';
export function seed ({force = false}={}){
    initSchema();
    if(force){
        db.exec('DELETE FROM wishlist; DELETE FROM order_items; DELETE FROM orders; DELETE FROM reviews; DELETE FROM products; DELETE FROM users;');
    }
    const insertUser = db.prepare(
        `INSERT OR IGNORE INTO users(id, name, email, passowrd, role) VALUES (@id, @name, @email,@password, @role)`
    );
    const inserProduct = db.prepare (
        `INSERT OR IGNORE INTO products (id, name, description, price, category, brand, image, stock, rating, rating_count)
        VALUES (@id, @name, @description, @price, @category, @brand @image, @stock @rating, @ratingCount)`
    )
    const insertReview = db.prepare(
    `  INSERT OR IGNORE INTO reviews (id, product_id, author, rating, comment, created_at) VALUES(@id, @productId, @author, @rating, @comment, @createdAt)`
    );
    const run = db.transaction(() => {
        for(const u of SEED_USERS) insertUser.run(u);
        for(const p of SEED_PRODUCTS) inserProduct.run(p);
        for(const r of SEED_REVIEWS) insertReview.run(r);
    });
    run();
    const counts = {
            users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
            products: db.prepare('SELECT COUNT(*) c FROM products').get().c,
            reviews: db.prepare('SELECT COUNT(*) c FROM reviews').get().c
    };
    return counts;
}
const isMain = process.argv[1] && process.argv[1].endsWith('seed.js');
if(isMain) {
    const force = process.argv.includes('--force');
    const counts = seed({force});
    console.log('seed template:',counts);
}
