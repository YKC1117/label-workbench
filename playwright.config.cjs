const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'tests/browser',timeout:180000,workers:1,retries:0,
  reporter:[['list'],['json',{outputFile:'artifacts/browser/results.json'}]],
  use:{baseURL:process.env.E2E_BASE_URL||'http://127.0.0.1:8080',acceptDownloads:true,trace:'retain-on-failure'},
  webServer:process.env.E2E_BASE_URL?undefined:{command:'python3 -m http.server 8080 --bind 127.0.0.1',port:8080,reuseExistingServer:false}
});
