const { getProductSoldCount, getVariantSoldCount}=require('../../utils/updateSoldCount');
const getCategorySoldCount=require('../../utils/soldCategory')
const getBrandSoldCount = require('../../utils/soldBrand');
const generateLedgerPDF = require('../../utils/generateLedgerPDf');

exports.getAdminLoginPage=(req,res)=>{
    try{
        if(req.session.admin){
           return res.redirect('/admin/dashboard')
        }
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '-1');

         res.render('admin/auth/login')
    }catch(error){
        console.error('error fetching Admin login page',error)
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
        if (email !== process.env.ADMIN_EMAIL||password !== process.env.ADMIN_PASSWORD) {
            return res.status(400).json({  error: 'Invalid Credentials' });
        }
               
    } catch (error) {
        console.log('Login error:', error);
        return res.status(500).json({  error: 'Server error, please try again' });
    }
};

exports.getDashboardPage= async (req,res)=>{
    try{

        if(!req.session.admin){
            return res.redirect('/admin/login')
        }
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '-1');
        
        const topSoldProducts = await (await getProductSoldCount()).sort((a, b) => b.totalSold - a.totalSold);
        const categorySales=await (await getCategorySoldCount()).sort((a, b) => b.totalSold - a.totalSold);
        const brandSales = (await getBrandSoldCount()).sort((a, b) => b.totalSold - a.totalSold);

        console.log("Category Sales:", categorySales);

        res.render('admin/auth/dashboard', { topSoldProducts ,categorySales,brandSales})
    }catch(error){
        console.log(`error getting dashboard`,error)
        res.redirect('/admin/login');
    }
}

exports.downloadLedgerPDF = async (req, res) => {
  try {
    const filePath = await generateLedgerPDF();
    res.download(filePath, 'ledger.pdf');
  } catch (error) {
    console.error('Error generating ledger:', error);
    res.status(500).send('Failed to generate ledger.');
  }
};

exports.adminlogOut =  (req, res) => {
   try {
    delete req.session.admin
    return res.redirect('/admin/login');

   } catch (error) {
    console.error(error.message)
    return res.status(500).send('An error occurred while logging out.'); 
   }

};