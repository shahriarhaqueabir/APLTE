import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { DRIVER_PATH } from './driver.js';

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 9222;

export async function attach({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  driverPath = DRIVER_PATH,
} = {}) {
  const options = new chrome.Options().debuggerAddress(`${host}:${port}`);
  const service = new chrome.ServiceBuilder(driverPath);
  return new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .setChromeService(service)
    .build();
}

export async function attachProof(driver) {
  const title = await driver.getTitle();
  const url = await driver.getCurrentUrl();
  const webdriver = await driver.executeScript('return navigator.webdriver');
  const ua = await driver.executeScript('return navigator.userAgent');
  return { title, url, webdriver, ua };
}

export async function dispose(driver) {
  if (!driver) return;
  try {
    await driver.quit();
  } catch {
    // Session already gone; nothing to clean up.
  }
}
