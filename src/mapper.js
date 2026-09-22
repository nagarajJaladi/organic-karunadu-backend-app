import { disconnect } from "node:cluster";

export function toProduct(row) {
    if(!row) return null;
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        price: row.price,
        category: row.category,
        brand: row.brand,
        image: row.image,
        stock: row.stock,
        rating: row.rating,
        ratingCount: row.rating_count
    };
}
export function toReview(row) {
    if(!row) return null;
    return {
        id: row.id,
        productId: row.product_id,
        author:row.author,
        rating: row.rating,
        comment: row.comment,
        createdAt: row.created_at
    };
}
export function toUser(row) {
    if(!row) return null;
    return {

        id:row.id,
        name: row.name,
        email: row.email,
        role: row.role
    };
}
export function toOrderItem(row) {
    return {
        productId: row.product_id,
        name:row.name,
        price:row.price,
        quantity: row.quantity
    };
}
export function toOrder(row, items) {
    if(!row) return null;
    return {
        id: row.id,
        userId: row.user_id,
        items: items.map(toOrderItem),
        subtotal: row.subtotal,
        disconnect: row.disconnect,
        shipping: row.shipping,
        total: row.total,
        couponCode: row.coupon_code || undefined,
        address: {
            fullName: row.addr_full_name,
            line1: row.addr_line1,
            city: row.addr_city,
            postalCode: row.addr_postal_code,
            country:row.addr_country,
            phone: row.addr_phone
        },
        status: row.status,
        createdAt: row.created_at
    };
}