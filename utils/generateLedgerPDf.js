const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { getProductSoldCount } = require('../utils/updateSoldCount');
const getCategorySoldCount = require('../utils/soldCategory');
const getBrandSoldCount = require('../utils/soldBrand');

const generateTable = (doc, headers, rows, startY) => {
  const columnSpacing = [50, 350];
  const rowHeight = 20;
  let y = startY;

  doc.font('Helvetica-Bold').fontSize(12);
  headers.forEach((header, i) => doc.text(header, columnSpacing[i], y));
  y += rowHeight;
  doc.moveTo(50, y - 5).lineTo(550, y - 5).stroke();

  doc.font('Helvetica').fontSize(11);
  rows.forEach(row => {
    row.forEach((cell, i) => {
      doc.text(cell, columnSpacing[i], y);
    });
    y += rowHeight;
  });

  return y;
};

const generateLedgerPDF = async () => {
  const doc = new PDFDocument({ margin: 50 });
  const filePath = path.join(__dirname, '../public/ledger.pdf');
  const writeStream = fs.createWriteStream(filePath);
  doc.pipe(writeStream);

  doc.font('Helvetica-Bold')
    .fontSize(20)
    .text('LUNE PERFUMERIE - Ledger Book', {
      align: 'center'
    })
    .moveDown(2);

  const topSoldProducts = (await getProductSoldCount()).sort((a, b) => b.totalSold - a.totalSold);
  doc.font('Helvetica-Bold')
    .fontSize(16)
    .text('Top Sold Products', {
      align: 'center'
    })
    .moveDown(1);

  const productRows = topSoldProducts.map(p => [p.product.productName, p.totalSold.toString()]);
  let currentY = doc.y;
  currentY = generateTable(doc, ['Product Name', 'Total Sold'], productRows, currentY + 10);

  doc.moveDown(2);

  const categorySales = (await getCategorySoldCount()).sort((a, b) => b.totalSold - a.totalSold);
  doc.font('Helvetica-Bold')
    .fontSize(16)
    .text('Category-wise Sales', {
      align: 'center'
    })
    .moveDown(1);

  const categoryRows = categorySales.map(c => [c.category.name, c.totalSold.toString()]);
  currentY = doc.y;
  currentY = generateTable(doc, ['Category Name', 'Total Sold'], categoryRows, currentY + 10);

  doc.moveDown(2);

  const brandSales = (await getBrandSoldCount()).sort((a, b) => b.totalSold - a.totalSold);
  doc.font('Helvetica-Bold')
    .fontSize(16)
    .text('Brand-wise Sales', {
      align: 'center'
    })
    .moveDown(1);

  const brandRows = brandSales.map(b => [b.brand.name, b.totalSold.toString()]);
  currentY = doc.y;
  generateTable(doc, ['Brand Name', 'Total Sold'], brandRows, currentY + 10);

  doc.moveDown(2);
  doc.font('Helvetica')
    .fontSize(10)
    .text(`Generated on: ${new Date().toLocaleString()}`, {
      align: 'right'
    });

  doc.end();

  return new Promise((resolve, reject) => {
    writeStream.on('finish', () => resolve(filePath));
    writeStream.on('error', reject);
  });
};

module.exports = generateLedgerPDF;
