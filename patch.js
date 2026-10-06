const fs = require('fs');
let content = fs.readFileSync('bot.js', 'utf8');

content = content.replace(
  "const chartId = data.replace('chart_', '');",
  "const rawId = data.replace('chart_', '');"
);

content = content.replace(
  "generateChartScreenshot(chartId, days);",
  "generateChartScreenshot('chart-' + rawId, days);"
);

content = content.replace(
  "captionMap[chartId]",
  "captionMap[rawId]"
);

content = content.replace(
  "${chartId}`",
  "${rawId}`"
);

fs.writeFileSync('bot.js', content);
