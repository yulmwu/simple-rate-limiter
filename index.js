const express = require('express')
const Redis = require('ioredis')
const FixedWindowRateLimiter = require('./fixedwindow')
// const TokenBucketRateLimiter = require('./tokenbucket')

const redis = new Redis() // 외부에서 Redis 인스턴스 생성
// const limiter = new TokenBucketRateLimiter(redis, {
//     capacity: 3, // 최대 토큰 수
//     refillRate: 1, // 초당 토큰 재충전 속도
//     ttlMs: 60 * 1000, // (사용자별) 토큰 버킷 TTL (밀리초)
//     debug: true // 디버그 모드 활성화
// })

const limiter = new FixedWindowRateLimiter(redis, {
    capacity: 3, // 최대 요청 수
    windowMs: 10 * 1000, // 윈도우 지속 시간 (밀리초)
    debug: true // 디버그 모드 활성화
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
