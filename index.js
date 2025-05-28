const express = require('express')
const Redis = require('ioredis')
const RateLimiter = require('./tokenbucket')

const redis = new Redis() // 외부에서 Redis 인스턴스 생성
const limiter = new RateLimiter(redis, {
    capacity: 3,
    refillRate: 1,
    ttlMs: 60 * 1000,
    debug: true
})

const app = express()
app.set('trust proxy', true)
app.use(limiter.getMiddleware())

app.get('/', (req, res) => {
    res.send('Hello from Redis Token Bucket Rate Limiter!')
})

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000')
    console.log('Redis: ', redis.status)
})
