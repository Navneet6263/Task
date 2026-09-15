const express = require('express');
const router = express.Router();
router.use(require('./tasks/part1'));
router.use(require('./tasks/part2'));
router.use(require('./tasks/part3'));
router.use(require('./tasks/part4'));
module.exports = router;
