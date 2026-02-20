const fs = require('fs');
const https = require('https');
const path = require('path');

const images = [
    { url: 'https://img1.wsimg.com/isteam/ip/ae80cb4c-bf8f-4fbc-a8ce-5f309ba7a3a0/20230523_052145.jpg', name: 'image_01.jpg' },
    { url: 'https://img1.wsimg.com/isteam/ip/ae80cb4c-bf8f-4fbc-a8ce-5f309ba7a3a0/FB_IMG_1667963384720.jpg', name: 'image_02.jpg' },
    { url: 'https://img1.wsimg.com/isteam/ip/ae80cb4c-bf8f-4fbc-a8ce-5f309ba7a3a0/20230803_154028.jpg', name: 'image_03.jpg' },
    { url: 'https://img1.wsimg.com/isteam/ip/ae80cb4c-bf8f-4fbc-a8ce-5f309ba7a3a0/20230523_075919%20(1).jpg', name: 'image_04.jpg' },
    { url: 'https://img1.wsimg.com/isteam/ip/ae80cb4c-bf8f-4fbc-a8ce-5f309ba7a3a0/71a244eb-c6ef-4622-85c2-aeac4838688d.jpg', name: 'image_05.jpg' },
    { url: 'https://img1.wsimg.com/isteam/ip/ae80cb4c-bf8f-4fbc-a8ce-5f309ba7a3a0/IMG-20230523-WA0026.jpg', name: 'image_06.jpg' }
];

const downloadDir = path.join(__dirname, '..', 'downloaded_images');

if (!fs.existsSync(downloadDir)){
    fs.mkdirSync(downloadDir);
}

images.forEach(img => {
    const file = fs.createWriteStream(path.join(downloadDir, img.name));
    https.get(img.url, function(response) {
        response.pipe(file);
        file.on('finish', function() {
            file.close(() => {
                console.log(`Downloaded ${img.name}`);
            });
        });
    }).on('error', function(err) {
        fs.unlink(path.join(downloadDir, img.name));
        console.error(`Error downloading ${img.name}: ${err.message}`);
    });
});
