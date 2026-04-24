const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const auth = require('../middleware/auth');
const crypto = require('crypto');
const path = require('path');

const router = express.Router();

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/', auth, upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No images provided.' });
    }

    const uploadedUrls = [];

    for (const file of req.files) {
      const fileName = `${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname)}`;

      const uploadParams = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: `products/${fileName}`,
        Body: file.buffer,
        ContentType: file.mimetype,
      };

      await s3.send(new PutObjectCommand(uploadParams));

      // Construct the URL manually or use the S3 URL format
      const region = await s3.config.region();
      const url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${region}.amazonaws.com/products/${fileName}`;
      uploadedUrls.push(url);
    }

    res.json({ urls: uploadedUrls });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Image upload failed.' });
  }
});

module.exports = router;
