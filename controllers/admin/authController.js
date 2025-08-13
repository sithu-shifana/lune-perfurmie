const { getProductSoldCount, getVariantSoldCount } = require('../../utils/updateSoldCount');
const getCategorySoldCount = require('../../utils/soldCategory');
const getBrandSoldCount = require('../../utils/soldBrand');
const generateLedgerPDF = require('../../utils/generateLedgerPDf');
const Order = require('../../models/orderSchema'); 
exports.getAdminLoginPage = (req, res) => {
    try {
        if (req.session.admin) {
            return res.redirect('/admin/dashboard')
        }
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '-1');

        res.render('admin/auth/login')
    } catch (error) {
        console.error('error fetching Admin login page', error)
    }
}

exports.loginAdmin = (req, res) => {
    try {
        const { email, password } = req.body;
        if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
            req.session.admin = {
                email: process.env.ADMIN_EMAIL
            };

            return res.status(200).json({ success: true });
        }
        if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
            return res.status(400).json({ error: 'Invalid Credentials' });
        }

    } catch (error) {
        console.log('Login error:', error);
        return res.status(500).json({ error: 'Server error, please try again' });
    }
};

// Helper function to get sales data for charts
const getSalesAnalytics = async () => {
    try {
        // Monthly sales data for line chart
        const monthlySales = await Order.aggregate([
            {
                $match: {
                    status: { $in: ['Paid', 'Pending'] },
                    deliveryStatus: { $ne: 'Cancelled' }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$orderDate" },
                        month: { $month: "$orderDate" }
                    },
                    totalSales: { $sum: "$finalTotal" },
                    orderCount: { $sum: 1 }
                }
            },
            {
                $sort: { "_id.year": 1, "_id.month": 1 }
            },
            {
                $limit: 12
            }
        ]);

        // Daily sales for last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const dailySales = await Order.aggregate([
            {
                $match: {
                    orderDate: { $gte: thirtyDaysAgo },
                    status: { $in: ['Paid', 'Pending'] },
                    deliveryStatus: { $ne: 'Cancelled' }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$orderDate" },
                        month: { $month: "$orderDate" },
                        day: { $dayOfMonth: "$orderDate" }
                    },
                    totalSales: { $sum: "$finalTotal" },
                    orderCount: { $sum: 1 }
                }
            },
            {
                $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
            }
        ]);

        // Payment method distribution
        const paymentMethodStats = await Order.aggregate([
            {
                $match: {
                    status: { $in: ['Paid', 'Pending'] },
                    deliveryStatus: { $ne: 'Cancelled' }
                }
            },
            {
                $group: {
                    _id: "$paymentMethod",
                    count: { $sum: 1 },
                    totalAmount: { $sum: "$finalTotal" }
                }
            }
        ]);

        // Order status distribution
        const orderStatusStats = await Order.aggregate([
            {
                $group: {
                    _id: "$deliveryStatus",
                    count: { $sum: 1 }
                }
            }
        ]);

        // Top revenue generating products
        const topRevenueProducts = await Order.aggregate([
            {
                $match: {
                    status: { $in: ['Paid', 'Pending'] },
                    deliveryStatus: { $ne: 'Cancelled' }
                }
            },
            { $unwind: "$items" },
            {
                $match: {
                    "items.status": "Active"
                }
            },
            {
                $group: {
                    _id: "$items.productId",
                    productName: { $first: "$items.productName" },
                    totalRevenue: { $sum: "$items.finalItemTotal" },
                    quantitySold: { $sum: "$items.quantity" }
                }
            },
            {
                $sort: { totalRevenue: -1 }
            },
            {
                $limit: 10
            },
            {
                $lookup: {
                    from: "products",
                    localField: "_id",
                    foreignField: "_id",
                    as: "product"
                }
            }
        ]);

        return {
            monthlySales,
            dailySales,
            paymentMethodStats,
            orderStatusStats,
            topRevenueProducts
        };
    } catch (error) {
        console.error('Error getting sales analytics:', error);
        return null;
    }
};

exports.getDashboardPage = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.redirect('/admin/login')
        }
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '-1');

        // Get existing data
        const topSoldProducts = await (await getProductSoldCount()).sort((a, b) => b.totalSold - a.totalSold).slice(0, 10);
        const categorySales = await (await getCategorySoldCount()).sort((a, b) => b.totalSold - a.totalSold);
        const brandSales = (await getBrandSoldCount()).sort((a, b) => b.totalSold - a.totalSold);

        // Get sales analytics data
        const salesAnalytics = await getSalesAnalytics();

        // Calculate key metrics
        const totalOrders = await Order.countDocuments({
            status: { $in: ['Paid', 'Pending'] },
            deliveryStatus: { $ne: 'Cancelled' }
        });

        const totalRevenue = await Order.aggregate([
            {
                $match: {
                    status: { $in: ['Paid', 'Pending'] },
                    deliveryStatus: { $ne: 'Cancelled' }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$finalTotal" }
                }
            }
        ]);

        const pendingOrders = await Order.countDocuments({
            deliveryStatus: { $in: ['Placed', 'Processing'] }
        });

        const deliveredOrders = await Order.countDocuments({
            deliveryStatus: 'Delivered'
        });

        const dashboardData = {
            topSoldProducts,
            categorySales,
            brandSales,
            salesAnalytics,
            keyMetrics: {
                totalOrders,
                totalRevenue: totalRevenue[0]?.total || 0,
                pendingOrders,
                deliveredOrders
            }
        };

        res.render('admin/auth/dashboard', dashboardData);
    } catch (error) {
        console.log(`error getting dashboard`, error);
        res.redirect('/admin/login');
    }
}

// Enhanced API endpoint for chart data with filters
exports.getChartData = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { period = 'daily', type = 'revenue', range = '30' } = req.query;
        const salesAnalytics = await getSalesAnalyticsWithFilters(period, type, parseInt(range));

        res.json(salesAnalytics);
    } catch (error) {
        console.error('Error getting chart data:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Enhanced analytics function with filters
const getSalesAnalyticsWithFilters = async (period, type, dayRange) => {
    try {
        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - dayRange);

        let groupBy = {};
        let sortBy = {};

        // Set grouping based on period
        switch (period) {
            case 'daily':
                groupBy = {
                    year: { $year: "$orderDate" },
                    month: { $month: "$orderDate" },
                    day: { $dayOfMonth: "$orderDate" }
                };
                sortBy = { "_id.year": 1, "_id.month": 1, "_id.day": 1 };
                break;
            case 'weekly':
                groupBy = {
                    year: { $year: "$orderDate" },
                    week: { $week: "$orderDate" }
                };
                sortBy = { "_id.year": 1, "_id.week": 1 };
                break;
            case 'monthly':
                groupBy = {
                    year: { $year: "$orderDate" },
                    month: { $month: "$orderDate" }
                };
                sortBy = { "_id.year": 1, "_id.month": 1 };
                break;
            case 'yearly':
                groupBy = {
                    year: { $year: "$orderDate" }
                };
                sortBy = { "_id.year": 1 };
                break;
        }

        // Sales data based on period
        const salesData = await Order.aggregate([
            {
                $match: {
                    orderDate: { $gte: dateLimit },
                    status: { $in: ['Paid', 'Pending'] },
                    deliveryStatus: { $ne: 'Cancelled' }
                }
            },
            {
                $group: {
                    _id: groupBy,
                    totalSales: { $sum: "$finalTotal" },
                    orderCount: { $sum: 1 }
                }
            },
            { $sort: sortBy },
            { $limit: 50 }
        ]);

        // Payment method stats
        const paymentMethodStats = await Order.aggregate([
            {
                $match: {
                    orderDate: { $gte: dateLimit },
                    status: { $in: ['Paid', 'Pending'] },
                    deliveryStatus: { $ne: 'Cancelled' }
                }
            },
            {
                $group: {
                    _id: "$paymentMethod",
                    count: { $sum: 1 },
                    totalAmount: { $sum: "$finalTotal" }
                }
            }
        ]);

        // Order status stats
        const orderStatusStats = await Order.aggregate([
            {
                $match: {
                    orderDate: { $gte: dateLimit }
                }
            },
            {
                $group: {
                    _id: "$deliveryStatus",
                    count: { $sum: 1 }
                }
            }
        ]);

        return {
            dailySales: salesData,
            monthlySales: salesData,
            paymentMethodStats,
            orderStatusStats
        };
    } catch (error) {
        console.error('Error getting filtered analytics:', error);
        return null;
    }
};

exports.downloadLedgerPDF = async (req, res) => {
    try {
        const filePath = await generateLedgerPDF();
        res.download(filePath, 'ledger.pdf');
    } catch (error) {
        console.error('Error generating ledger:', error);
        res.status(500).send('Failed to generate ledger.');
    }
};

exports.adminlogOut = (req, res) => {
    try {
        delete req.session.admin
        return res.redirect('/admin/login');

    } catch (error) {
        console.error(error.message)
        return res.status(500).send('An error occurred while logging out.');
    }
};