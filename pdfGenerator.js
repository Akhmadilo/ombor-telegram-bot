const puppeteer = require('puppeteer');

const getLaunchOptions = () => {
  const options = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--font-render-hinting=none',
    ],
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    options.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  return options;
};

async function generateDashboardPDF(url) {
  let browser;
  try {
    // Launch puppeteer with optimized settings for Render/Docker/Linux
    browser = await puppeteer.launch(getLaunchOptions());
    const page = await browser.newPage();
    
    // Set a good viewport size for the dashboard layout
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    
    // Navigate to the dashboard with domcontentloaded
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    
    // Wait for content (table, matrix, or charts) to mount in DOM
    try {
      await page.waitForSelector('.data-table, .matrix-table, .chart-card, .table-section', { timeout: 25000 });
      // Wait until loading indicator is gone
      await page.waitForFunction(() => !document.querySelector('.loading-screen'), { timeout: 20000 });
    } catch (e) {
      console.warn('Selector wait warning in generateDashboardPDF:', e.message);
    }

    // Wait 2 seconds for ChartJS animations to finish
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
    // 1. Launch puppeteer with optimized settings for Render/Docker/Linux
    browser = await puppeteer.launch(getLaunchOptions());
    const page = await browser.newPage();
    
    // Make sure viewport is 1440x900, deviceScaleFactor: 1.5 (memory efficient for Render 512MB RAM)
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
    
    // 2. Navigate to URL
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    
    // Wait for the chart element to mount in DOM and loading to finish
    try {
      await page.waitForSelector(`#${chartId}`, { timeout: 20000 });
      await page.waitForFunction(() => !document.querySelector('.loading-screen'), { timeout: 20000 });
    } catch (e) {
      console.warn(`Element #${chartId} wait warning:`, e.message);
    }

    // Wait 2 seconds for ChartJS render animations
    await new Promise(r => setTimeout(r, 2000));
    
    // 4. Find element with id='{chartId}' on the page
    const element = await page.$(`#${chartId}`);
    
    let imageBuffer;
    if (element) {
      // 5. Take element screenshot as PNG
      imageBuffer = await element.screenshot({ type: 'png' });
    } else {
      // If element not found, take full page screenshot as fallback
      imageBuffer = await page.screenshot({ type: 'png', fullPage: true });
    }
    
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
