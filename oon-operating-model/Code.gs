/**
 * ER OON Revenue Cycle - 2027 Operating Model web app.
 *
 * Deploy: Extensions > Apps Script, add this file and Index.html,
 * then Deploy > New deployment > Web app.
 * The logo file in Drive must be shared as "Anyone with the link can view",
 * otherwise viewers see the fallback logo.
 */

const LOGO_FILE_ID = '18bqSCdjITeFAI8RmT6EAngDvhOV5cXmX';
const LOGO_URL = 'https://drive.google.com/thumbnail?id=' + LOGO_FILE_ID + '&sz=w1000';

function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');
  template.LOGO_URL = LOGO_URL;
  return template
    .evaluate()
    .setTitle('ER OON Operating Model 2027')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
