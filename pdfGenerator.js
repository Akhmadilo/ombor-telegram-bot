const puppeteer = require('puppeteer');

async function generateDashboardPDF(url) {
  let browser;
  try {
    // Launch puppeteer
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true,
    });
    const page = await browser.newPage();
    
    // Set a good viewport size for the dashboard layout
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    
    // Navigate to the dashboard
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Optional: wait a bit more for ChartJS animations to finish
    await new Promise(r => setTimeout(r, 2000));
    
    // Hide unnecessary elements in the PDF like the header/download buttons (if needed)
    await page.evaluate(() => {
      // Hide all download buttons
      document.querySelectorAll('button[title="PDF formatida yuklash"]').forEach(btn => btn.style.display = 'none');
      
      // Remove heavy CSS filters that cause Puppeteer to generate massive rasterized PDFs
      const style = document.createElement('style');
      style.innerHTML = `
        * {
          box-shadow: none !important;
          backdrop-filter: none !important;
          text-shadow: none !important;
          border-radius: 0 !important;
        }
        .glass-panel {
           background: #ffffff !important;
           border: 1px solid #cbd5e1 !important;
        }
      `;
      document.head.appendChild(style);
    });

    // Generate PDF (A4 formatting, print background colors)
    const pdfBuffer = await page.pdf({
      format: 'A3', // A3 allows more content to fit width-wise
      printBackground: true,
      margin: {
        top: '20px',
        bottom: '20px',
        left: '20px',
        right: '20px'
      }
    });

    return pdfBuffer;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function generateChartScreenshot(chartId, days = 0) {
  const url = `${process.env.DASHBOARD_URL || 'https://ombor-dashboard.vercel.app'}?bot=1&chart=${chartId}&days=${days}`;
  
  let browser;
  try {
    // 1. Launch puppeteer headless
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true,
    });
    const page = await browser.newPage();
    
    // Make sure viewport is 1440x900, deviceScaleFactor: 2
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    
    // 2. Navigate to URL
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // 3. Wait for networkidle0 + 3 seconds (for ChartJS animations)
    await new Promise(r => setTimeout(r, 3000));
    
    // 4. Find element with id='{chartId}' on the page
    const element = await page.$(`#${chartId}`);
    
    let imageBuffer;
    if (element) {
      // 5. Take element screenshot (NOT full page) as PNG with deviceScaleFactor: 2
      imageBuffer = await element.screenshot({ type: 'png' });
    } else {
      // If element not found, take full page screenshot as fallback
      imageBuffer = await page.screenshot({ type: 'png', fullPage: true });
    }
    
    // 6. Return the PNG buffer
    return imageBuffer;
  } catch (error) {
    console.error('Error generating screenshot:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { generateDashboardPDF, generateChartScreenshot };
