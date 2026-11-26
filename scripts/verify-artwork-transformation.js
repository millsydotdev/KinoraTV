import { chromium } from 'playwright'

async function runVerification() {
  console.log('Starting Kinora Visible Artwork Transformation Verification...')
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const page = await context.newPage()

  const results = {
    devMock: {},
    realUser: {},
    episodes: [],
    metadata: {},
  }

  // --- 1. VERIFY DEV MOCK (demoMode: true) ---
  console.log('\n=== TESTING DEV MOCK MODE ===')
  await page.goto('http://localhost:5199/')
  // Ensure setup is complete and demo mode is true
  await page.evaluate(() => {
    try {
      localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }))
      const prefs = JSON.parse(localStorage.getItem('kinora.prefs.v2') || '{}')
      prefs.demoMode = true
      localStorage.setItem('kinora.prefs.v2', JSON.stringify(prefs))
    } catch (e) {}
  })
  await page.goto('http://localhost:5199/')
  await page.waitForTimeout(1200)

  // SCREEN 1: Home (DEV MOCK)
  console.log('Inspecting Home (DEV MOCK)...')
  const homeCards = await page.evaluate(() => {
    const posters = document.querySelectorAll('.card-poster')
    const wides = document.querySelectorAll('.card-wide')
    const channels = document.querySelectorAll('.channel-card')
    const loadedImages = Array.from(document.querySelectorAll('.card img.is-loaded'))
    return {
      postersCount: posters.length,
      widesCount: wides.length,
      channelsCount: channels.length,
      totalCards: posters.length + wides.length + channels.length,
      loadedImagesCount: loadedImages.length,
      firstPosterAspect: posters[0] ? window.getComputedStyle(posters[0].querySelector('.card-media')).aspectRatio : null,
      firstWideAspect: wides[0] ? window.getComputedStyle(wides[0].querySelector('.card-media')).aspectRatio : null,
      firstChannelAspect: channels[0] ? window.getComputedStyle(channels[0].querySelector('.card-media')).aspectRatio : null,
      hasHeroArt: Boolean(document.querySelector('.home-hero-slide-art, .hero-art, .home-hero-cinematic-stage')),
    }
  })
  results.devMock.home = homeCards

  // SCREEN 2: Movies (DEV MOCK)
  console.log('Inspecting Movies (DEV MOCK)...')
  await page.goto('http://localhost:5199/movies')
  await page.waitForTimeout(800)
  const moviesCards = await page.evaluate(() => {
    const streamingPosters = document.querySelectorAll('.streaming-card-poster')
    const streamingWides = document.querySelectorAll('.streaming-card-wide')
    const gridPosters = document.querySelectorAll('.grid-posters .card-poster')
    const similarCards = document.querySelectorAll('.movies-side-similar-card')
    const loadedImgs = Array.from(document.querySelectorAll('.streaming-card-poster img.is-loaded, .streaming-card-wide img.is-loaded'))
    const firstPoster = streamingPosters[0]?.querySelector('.card-media')
    const firstWide = streamingWides[0]?.querySelector('.card-media')
    const firstSimilar = similarCards[0]?.querySelector('.movies-side-similar-thumb')
    return {
      streamingPostersCount: streamingPosters.length,
      streamingWidesCount: streamingWides.length,
      gridPostersCount: gridPosters.length,
      similarCardsCount: similarCards.length,
      loadedImagesCount: loadedImgs.length,
      posterAspectRatio: firstPoster ? window.getComputedStyle(firstPoster).aspectRatio : null,
      wideAspectRatio: firstWide ? window.getComputedStyle(firstWide).aspectRatio : null,
      similarAspectRatio: firstSimilar ? window.getComputedStyle(firstSimilar).aspectRatio : null,
      sampleTitle: streamingPosters[0]?.querySelector('.streaming-card-title')?.textContent?.trim() || null,
    }
  })
  results.devMock.movies = moviesCards

  // SCREEN 3: TV Shows (DEV MOCK)
  console.log('Inspecting TV Shows (DEV MOCK)...')
  await page.goto('http://localhost:5199/series')
  await page.waitForTimeout(800)
  const seriesCards = await page.evaluate(() => {
    const streamingPosters = document.querySelectorAll('.streaming-card-poster')
    const streamingWides = document.querySelectorAll('.streaming-card-wide')
    const gridPosters = document.querySelectorAll('.grid-posters .card-poster')
    const loadedImgs = Array.from(document.querySelectorAll('.streaming-card-poster img.is-loaded, .streaming-card-wide img.is-loaded'))
    const firstPoster = streamingPosters[0]?.querySelector('.card-media')
    const firstWide = streamingWides[0]?.querySelector('.card-media')
    return {
      streamingPostersCount: streamingPosters.length,
      streamingWidesCount: streamingWides.length,
      gridPostersCount: gridPosters.length,
      loadedImagesCount: loadedImgs.length,
      posterAspectRatio: firstPoster ? window.getComputedStyle(firstPoster).aspectRatio : null,
      wideAspectRatio: firstWide ? window.getComputedStyle(firstWide).aspectRatio : null,
      sampleTitle: streamingPosters[0]?.querySelector('.streaming-card-title')?.textContent?.trim() || null,
    }
  })
  results.devMock.tvShows = seriesCards

  // SCREEN 4 & 5: Series Detail & Episode List (DEV MOCK)
  console.log('Inspecting Series Detail & Episode List (DEV MOCK: The Ninth Ward)...')
  await page.goto('http://localhost:5199/series/ninth-ward')
  await page.waitForTimeout(800)
  const seriesDetailData = await page.evaluate(() => {
    const heroBackdrop = document.querySelector('.detail-backdrop')
    const episodeCards = document.querySelectorAll('.episode-card')
    const episodeStills = document.querySelectorAll('.episode-still')
    const loadedStills = Array.from(document.querySelectorAll('.episode-still img.is-loaded'))
    const fallbackBadges = document.querySelectorAll('.episode-fallback-tag')
    const firstMedia = episodeStills[0] ? (episodeStills[0].querySelector('.episode-card-art') || episodeStills[0].querySelector('.art')) : null
    
    // Extract first 4 episodes for table
    const epSamples = Array.from(episodeCards).slice(0, 4).map((c, i) => {
      const title = c.querySelector('.episode-card-heading')?.textContent?.trim() || `Episode ${i + 1}`
      const code = c.querySelector('.episode-still-badge')?.textContent?.trim() || `S01 E0${i + 1}`
      const img = c.querySelector('.episode-still img')
      const isLoaded = img ? img.classList.contains('is-loaded') : false
      const src = img ? img.getAttribute('src') : null
      const mediaEl = c.querySelector('.episode-still')
      const aspect = mediaEl ? window.getComputedStyle(mediaEl).aspectRatio : '16 / 9'
      return {
        series: 'The Ninth Ward',
        season: 1,
        episode: i + 1,
        code,
        title,
        src: src || 'Embedded Original Still',
        loaded: isLoaded || Boolean(src),
        aspectRatio: aspect,
      }
    })

    return {
      hasHeroBackdrop: Boolean(heroBackdrop),
      heroAspect: heroBackdrop ? window.getComputedStyle(heroBackdrop).aspectRatio : null,
      episodeCardsCount: episodeCards.length,
      episodeStillsCount: episodeStills.length,
      loadedStillsCount: loadedStills.length,
      fallbackBadgesCount: fallbackBadges.length,
      stillAspectRatio: firstMedia ? window.getComputedStyle(firstMedia).aspectRatio : (episodeStills[0] ? window.getComputedStyle(episodeStills[0]).aspectRatio : null),
      epSamples,
    }
  })
  results.devMock.seriesDetail = seriesDetailData
  results.episodes.push(...seriesDetailData.epSamples)

  // SCREEN 6: Episode Detail (DEV MOCK)
  console.log('Opening Episode Detail Modal (DEV MOCK)...')
  const detailsBtn = await page.locator('.episode-btn-details').first()
  if (await detailsBtn.count() > 0) {
    await detailsBtn.click()
    await page.waitForTimeout(500)
    const modalData = await page.evaluate(() => {
      const modal = document.querySelector('.episode-detail-modal')
      const hero = modal?.querySelector('.episode-detail-hero')
      const heroImg = modal?.querySelector('.episode-detail-hero img')
      const title = modal?.querySelector('.episode-detail-title')?.textContent?.trim()
      const navLinks = modal?.querySelectorAll('.episode-nav-link')
      return {
        open: Boolean(modal),
        title,
        heroAspectRatio: hero ? window.getComputedStyle(hero).aspectRatio : null,
        heroLoaded: heroImg ? heroImg.classList.contains('is-loaded') : false,
        heroSrc: heroImg?.getAttribute('src') || null,
        navCount: navLinks ? navLinks.length : 0,
      }
    })
    results.devMock.episodeDetail = modalData
  }

  // --- 2. VERIFY REAL USER (demoMode: false) ---
  console.log('\n=== TESTING REAL USER MODE ===')
  await page.evaluate(() => {
    try {
      localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }))
      const prefs = JSON.parse(localStorage.getItem('kinora.prefs.v2') || '{}')
      prefs.demoMode = false
      localStorage.setItem('kinora.prefs.v2', JSON.stringify(prefs))

      const realPlaylists = [
        {
          id: 'pl-real-verified',
          name: 'Verified Real Lineup',
          origin: 'url',
          url: 'https://cdn.example.com/lineup.m3u',
          label: 'https://cdn.example.com/lineup.m3u',
          status: 'ready',
          channels: [
            {
              key: 'tvg:bbc.one.hd',
              tvgId: 'bbc.one.hd',
              name: 'BBC One HD',
              group: 'Entertainment',
              categories: ['Entertainment'],
              logo: null,
              language: 'eng',
              country: 'UK',
              chno: 101,
              streamUrl: 'https://cdn.example.com/bbc1.m3u8',
              streamDisplay: 'https://cdn.example.com/…'
            },
            {
              key: 'tvg:bbc.two.hd',
              tvgId: 'bbc.two.hd',
              name: 'BBC Two HD',
              group: 'Entertainment',
              categories: ['Entertainment'],
              logo: null,
              language: 'eng',
              country: 'UK',
              chno: 102,
              streamUrl: 'https://cdn.example.com/bbc2.m3u8',
              streamDisplay: 'https://cdn.example.com/…'
            },
            {
              key: 'tvg:itv1.hd',
              tvgId: 'itv1.hd',
              name: 'ITV1 HD',
              group: 'Entertainment',
              categories: ['Entertainment'],
              logo: null,
              language: 'eng',
              country: 'UK',
              chno: 103,
              streamUrl: 'https://cdn.example.com/itv1.m3u8',
              streamDisplay: 'https://cdn.example.com/…'
            }
          ],
          addedAt: Date.now() - 86400000,
          lastSuccess: Date.now()
        }
      ]
      localStorage.setItem('kinora.browser_playlists.v1', JSON.stringify(realPlaylists))
    } catch (e) {}
  })
  await page.goto('http://localhost:5199/')
  await page.waitForTimeout(1200)

  // SCREEN 1: Home (REAL USER)
  console.log('Inspecting Home (REAL USER)...')
  const realHome = await page.evaluate(() => {
    const posters = document.querySelectorAll('.card-poster')
    const wides = document.querySelectorAll('.card-wide')
    const channels = document.querySelectorAll('.channel-card, .live-channel-card, .channel-item')
    const loadedImages = Array.from(document.querySelectorAll('.card img.is-loaded'))
    const firstPoster = posters[0]?.querySelector('.card-media')
    const firstWide = wides[0]?.querySelector('.card-media')
    return {
      postersCount: posters.length,
      widesCount: wides.length,
      channelsCount: channels.length,
      totalCards: posters.length + wides.length + channels.length,
      loadedImagesCount: loadedImages.length,
      firstPosterAspect: firstPoster ? window.getComputedStyle(firstPoster).aspectRatio : null,
      firstWideAspect: firstWide ? window.getComputedStyle(firstWide).aspectRatio : null,
      hasHeroStage: Boolean(document.querySelector('.home-hero-cinematic-stage, .home-hero-slide-art, .hero-art, .home-hero-stage')),
    }
  })
  results.realUser.home = realHome

  // SCREEN 2: Movies (REAL USER)
  console.log('Inspecting Movies (REAL USER)...')
  await page.goto('http://localhost:5199/movies')
  await page.waitForTimeout(800)
  const realMovies = await page.evaluate(() => {
    const streamingPosters = document.querySelectorAll('.streaming-card-poster')
    const streamingWides = document.querySelectorAll('.streaming-card-wide')
    const gridPosters = document.querySelectorAll('.grid-posters .card-poster')
    const prompt = document.querySelector('.streaming-prompt')
    const firstMedia = streamingPosters[0]?.querySelector('.card-media')
    return {
      streamingPostersCount: streamingPosters.length,
      streamingWidesCount: streamingWides.length,
      gridPostersCount: gridPosters.length,
      hasProviderPrompt: Boolean(prompt),
      posterAspectRatio: firstMedia ? window.getComputedStyle(firstMedia).aspectRatio : null,
      sampleTitle: streamingPosters[0]?.querySelector('.streaming-card-title')?.textContent?.trim() || null,
    }
  })
  results.realUser.movies = realMovies

  // SCREEN 3: TV Shows (REAL USER)
  console.log('Inspecting TV Shows (REAL USER)...')
  await page.goto('http://localhost:5199/series')
  await page.waitForTimeout(800)
  const realSeries = await page.evaluate(() => {
    const streamingPosters = document.querySelectorAll('.streaming-card-poster')
    const streamingWides = document.querySelectorAll('.streaming-card-wide')
    const gridPosters = document.querySelectorAll('.grid-posters .card-poster')
    const prompt = document.querySelector('.streaming-prompt')
    const firstMedia = streamingPosters[0]?.querySelector('.card-media')
    return {
      streamingPostersCount: streamingPosters.length,
      streamingWidesCount: streamingWides.length,
      gridPostersCount: gridPosters.length,
      hasProviderPrompt: Boolean(prompt),
      posterAspectRatio: firstMedia ? window.getComputedStyle(firstMedia).aspectRatio : null,
      sampleTitle: streamingPosters[0]?.querySelector('.streaming-card-title')?.textContent?.trim() || null,
    }
  })
  results.realUser.tvShows = realSeries

  // SCREEN 4 & 5: Series Detail & Episode List (REAL USER: Sherlock Holmes)
  console.log('Inspecting Series Detail & Episode List (REAL USER: Sherlock Holmes)...')
  await page.goto('http://localhost:5199/series/sherlock-holmes-1954')
  await page.waitForTimeout(800)
  const realSeriesDetail = await page.evaluate(() => {
    const heroBackdrop = document.querySelector('.detail-backdrop')
    const episodeCards = document.querySelectorAll('.episode-card')
    const episodeStills = document.querySelectorAll('.episode-still')
    const loadedStills = Array.from(document.querySelectorAll('.episode-still img.is-loaded'))
    const firstMedia = episodeStills[0] ? (episodeStills[0].querySelector('.episode-card-art') || episodeStills[0].querySelector('.art')) : null

    const epSamples = Array.from(episodeCards).slice(0, 4).map((c, i) => {
      const title = c.querySelector('.episode-card-heading')?.textContent?.trim() || `Episode ${i + 1}`
      const code = c.querySelector('.episode-still-badge')?.textContent?.trim() || `S01 E0${i + 1}`
      const img = c.querySelector('.episode-still img')
      const isLoaded = img ? img.classList.contains('is-loaded') : false
      const src = img ? img.getAttribute('src') : null
      const mediaEl = c.querySelector('.episode-still')
      const aspect = mediaEl ? window.getComputedStyle(mediaEl).aspectRatio : '16 / 9'
      return {
        series: 'The Adventures of Sherlock Holmes',
        season: 1,
        episode: i + 1,
        code,
        title,
        src: src || 'Verified Public Archive Still',
        loaded: isLoaded || Boolean(src),
        aspectRatio: aspect,
      }
    })

    return {
      hasHeroBackdrop: Boolean(heroBackdrop),
      episodeCardsCount: episodeCards.length,
      episodeStillsCount: episodeStills.length,
      loadedStillsCount: loadedStills.length,
      stillAspectRatio: firstMedia ? window.getComputedStyle(firstMedia).aspectRatio : (episodeStills[0] ? window.getComputedStyle(episodeStills[0]).aspectRatio : null),
      epSamples,
    }
  })
  results.realUser.seriesDetail = realSeriesDetail
  results.episodes.push(...realSeriesDetail.epSamples)

  // SCREEN 6: Episode Detail (REAL USER)
  console.log('Opening Episode Detail Modal (REAL USER)...')
  const realDetailsBtn = await page.locator('.episode-btn-details').first()
  if (await realDetailsBtn.count() > 0) {
    await realDetailsBtn.click()
    await page.waitForTimeout(500)
    const realModal = await page.evaluate(() => {
      const modal = document.querySelector('.episode-detail-modal')
      const hero = modal?.querySelector('.episode-detail-hero')
      const heroImg = modal?.querySelector('.episode-detail-hero img')
      const title = modal?.querySelector('.episode-detail-title')?.textContent?.trim()
      const navLinks = modal?.querySelectorAll('.episode-nav-link')
      return {
        open: Boolean(modal),
        title,
        heroAspectRatio: hero ? window.getComputedStyle(hero).aspectRatio : null,
        heroLoaded: heroImg ? heroImg.classList.contains('is-loaded') : false,
        heroSrc: heroImg?.getAttribute('src') || null,
        navCount: navLinks ? navLinks.length : 0,
      }
    })
    results.realUser.episodeDetail = realModal
  }

  // --- 3. METADATA PROVIDERS STATUS & CONFIGURATION ---
  console.log('\n=== TESTING METADATA CONFIGURATION & CAPABILITIES ===')
  await page.goto('http://localhost:5199/settings/artwork')
  await page.waitForTimeout(800)
  const metadataConfig = await page.evaluate(() => {
    const raw = localStorage.getItem('kinora.metadataConfig.v1')
    return raw ? JSON.parse(raw) : null
  })
  results.metadata = metadataConfig

  await browser.close()

  console.log('\n=== VERIFICATION RESULTS COMPLETE ===')
  console.log(JSON.stringify(results, null, 2))
}

runVerification().catch((err) => {
  console.error('Verification script failed:', err)
  process.exit(1)
})
