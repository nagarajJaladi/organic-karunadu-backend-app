import { disconnect } from "node:cluster";

export function toProduct(row) {
    if(!row) return null;
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        price: row.price,
        category: row.category,
        categoryId: row.category_id,
        brand: row.brand,
        image: row.image,
        howToUse: row.how_to_use ?? '',
        nutrition: row.nutrition ?? '',
        certifications: row.certifications ?? '',
        whyChoose: row.why_choose ?? '',
        sourcing: row.sourcing ?? '',
        images: [row.image, ...(row.additional_images || [])].filter(Boolean),
        stock: row.stock,
        rating: row.rating,
        ratingCount: row.rating_count,
        varients:Array.isArray(row.varients) ? row.varients : []
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
        name: row.product_name ?? row.name,
        price: row.unit_price ?? row.price,
        subtotal: row.subtotal ?? Number(row.price) * Number(row.quantity),
        quantity: row.quantity,
        size: row.size ?? ''
    };
}
export function toOrder(row, items) {
    if(!row) return null;
    return {
        id: row.id,
        orderNumber: row.order_number ?? row.id,
        userId: row.user_id,
        customerName: row.customer_name ?? row.addr_full_name ?? '',
        mobileNumber: row.mobile_number ?? row.addr_phone ?? '',
        customerEmail: row.customer_email ?? null,
        items: items.map(toOrderItem),
        subtotal: row.subtotal,
        discount: row.discount ?? 0,
        shipping: row.shipping,
        total: row.total,
        couponCode: row.coupon_code || undefined,
        paymentMethod: row.payment_method || 'cod',
        paymentStatus: row.payment_status || 'pending',
        shippingAddress: row.shipping_address ?? {
            fullName: row.addr_full_name,
            line1: row.addr_line1,
            city: row.addr_city,
            postalCode: row.addr_postal_code,
            country: row.addr_country,
            phone: row.addr_phone
        },
        address: {
            fullName: row.addr_full_name,
            line1: row.addr_line1,
            city: row.addr_city,
            postalCode: row.addr_postal_code,
            country:row.addr_country,
            phone: row.addr_phone
        },
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at ?? row.created_at
    };
}