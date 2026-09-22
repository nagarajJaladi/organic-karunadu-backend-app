function svgImage (bg, label) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'>
        <rect width='100%' height='100%' fill='${bg}'/>
        <rect x='50%' y='50%' font-family='sans-serif' font-size='28' fill=''white'
            text-anchor='middle' dominant-baseline='middle'> ${label} </text>
        </svg>    
    `;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
export const SEED_USERS = [
    {id: 'u-admin',name:'Admin', email:'admin@shop.com',role:'admin',password:'admin123'},
    {id:'u-demo',name:'Demo User',email:'demo@shop.com', role:'customer', password:'demo123'}
];
export const SEED_PRODUCTS = [
    {
        id:'p1',
        name:'saflower oil',
        description: 'better health',
        price: 1223,
        category:'Audio',
        brand: 'aurora',
        iamge: svgImage('#4f46e5', 'Headphones'),
        stock:25,
        rating:4.6,
        ratingCount:126
    },
    {
        id:'p2',
        name:'Coconut oil',
        description: 'better health',
        price: 1223,
        category:'Footware',
        brand: 'aurora',
        iamge: svgImage('#4f46e5', 'Headphones'),
        stock:25,
        rating:4.6,
        ratingCount:126
    },{
        id:'p3',
        name:'ground nut oil',
        description: 'better health',
        price: 1223,
        category:'Audio',
        brand: 'aurora',
        iamge: svgImage('#4f46e5', 'Headphones'),
        stock:25,
        rating:4.6,
        ratingCount:126
    },{
        id:'p4',
        name:'sas oil',
        description: 'better health',
        price: 1223,
        category:'Audio',
        brand: 'aurora',
        iamge: svgImage('#4f46e5', 'Headphones'),
        stock:25,
        rating:4.6,
        ratingCount:126
    },{
        id:'p1',
        name:'saflower oil',
        description: 'better health',
        price: 1223,
        category:'Audio',
        brand: 'aurora',
        iamge: svgImage('#4f46e5', 'Headphones'),
        stock:25,
        rating:4.6,
        ratingCount:126
    },{
        id:'p1',
        name:'saflower oil',
        description: 'better health',
        price: 1223,
        category:'Audio',
        brand: 'aurora',
        iamge: svgImage('#4f46e5', 'Headphones'),
        stock:25,
        rating:4.6,
        ratingCount:126
    },{
        id:'p1',
        name:'saflower oil',
        description: 'better health',
        price: 1223,
        category:'Audio',
        brand: 'aurora',
        iamge: svgImage('#4f46e5', 'Headphones'),
        stock:25,
        rating:4.6,
        ratingCount:126
    },{
        id:'p1',
        name:'saflower oil',
        description: 'better health',
        price: 1223,
        category:'Audio',
        brand: 'aurora',
        iamge: svgImage('#4f46e5', 'Headphones'),
        stock:25,
        rating:4.6,
        ratingCount:126
    }
];
export const SEED_REVIEWS = [
    {
        id:'r1',
        productId:'p1',
        author: 'Jordan',
        rating: 5,
        comment: 'nicee',
        createdAt: '2026-06-01T0:00:00.000Z'
    },
    {
        id:'r2',
        productId:'p1',
        author: 'Jordan',
        rating: 4,
        comment: 'nicee',
        createdAt: '2026-06-01T0:00:00.000Z'
    },
    {
        id:'r3',
        productId:'p2',
        author: 'Jordan',
        rating: 2,
        comment: 'nicee',
        createdAt: '2026-06-01T0:00:00.000Z'
    }
];