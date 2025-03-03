// index.js
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs-extra');

// Task 1: Scrape DU Bulletin for Upper-Division CS Courses With No Prerequisites
async function scrapeBulletin() {
    try {
      const url = 'https://bulletin.du.edu/undergraduate/coursedescriptions/comp/';
      const { data: html } = await axios.get(url);
      const $ = cheerio.load(html);
      let courses = [];
  
      $('.courseblock').each((i, elem) => {
        // Get the text inside the <strong> tag within the course title.
        const strongText = $(elem).find('p.courseblocktitle strong').text().trim();
        if (!strongText) return;
        
        // Expected format: "COMP 3001 Course Title (4 Credits)"
        // This regex captures the 4-digit course number and the course title.
        const regex = /^COMP\s*(\d{4})\s+(.+?)(\s+\(.*Credits\))?$/i;
        const match = strongText.match(regex);
        if (!match) return;
        
        const courseNumber = parseInt(match[1], 10);
        // Only include upper-level courses (3000 or greater)
        if (courseNumber < 3000) return;
        
        const courseCodeFormatted = `COMP-${match[1]}`;
        const courseTitle = match[2].trim();
  
        // Check for prerequisites: if any <a> tag exists inside the course description, skip it.
        const hasPrereq = $(elem).find('p.courseblockdesc a').length > 0;
        if (hasPrereq) return;
        
        courses.push({
          course: courseCodeFormatted,
          title: courseTitle
        });
      });
  
      await fs.ensureDir('results');
      await fs.writeJson('results/bulletin.json', { courses }, { spaces: 2 });
      console.log('Bulletin scraping complete. Results saved to results/bulletin.json');
    } catch (err) {
      console.error('Error scraping bulletin:', err.message);
    }
  }
// Task 2: Scrape DU Athletics Site for Upcoming Events from the Top Carousel


async function scrapeAthleticEvents() {
    try {
      // Fetch the athletics page
      const { data: html } = await axios.get('https://denverpioneers.com/index.aspx');
      const $ = cheerio.load(html);
  
      // Use the provided selectors to extract the data
  
      // Get the DU team name from the "c-scoreboard__sport" element (inside the away team container)
      const duTeam = $('.c-scoreboard__team--away .c-scoreboard__sport').text().trim();
  
      // Get the opponent team name from the home team container (using its team name element)
      const opponent = $('.c-scoreboard__team--home .c-scoreboard__team-name').text().trim();
  
      // Get the event date from the datetime element.
      // (This selector may need adjustment if the carousel changes.)
      const eventDate = $('#main-content > section:nth-child(1) > scoreboard-component > div > div.c-scoreboard__list.flex-item-1.slick-initialized.slick-slider > div > div > div:nth-child(10) > div.c-scoreboard__datetime.flex > div')
                           .text().trim();
  
      // Build the event object
      const event = {
        duTeam,
        opponent,
        date: eventDate
      };
  
      // Build the result JSON object
      const result = { events: [event] };
  
      // Write the result to a JSON file
      await fs.writeJson('results/athletic_events.json', result, { spaces: 2 });
      console.log('Athletic events data saved successfully.');
    } catch (error) {
      console.error('Error scraping athletic events:', error);
    }
  }
  
// Task 3: Scrape DU Main Calendar for 2025 Events
async function fetchEventDescription(eventUrl) {
    try {
      const { data: detailHtml } = await axios.get(eventUrl);
      const $$ = cheerio.load(detailHtml);
      // Extract the description from the details page using the provided structure.
      const description = $$('div.description[itemprop="description"]').text().trim();
      return description;
    } catch (err) {
      console.error(`Error fetching details from ${eventUrl}: ${err.message}`);
      return '';
    }
  }
  
  async function scrapeCalendarEvents() {
    const baseUrl = 'https://www.du.edu/calendar';
    let allEvents = [];
  
    // Build month ranges for 2025
    let months = [];
    for (let month = 1; month <= 12; month++) {
      const start = `2025-${month.toString().padStart(2, '0')}-01`;
      let end;
      if (month === 12) {
        end = '2026-01-01';
      } else {
        end = `2025-${(month + 1).toString().padStart(2, '0')}-01`;
      }
      months.push({ start, end });
    }
  
    // Loop over each month sequentially
    for (const { start, end } of months) {
      const url = `${baseUrl}?search=&start_date=${start}&end_date=${end}#events-listing-date-filter-anchor`;
    //   console.log(`Fetching events for ${start} to ${end}`);
      try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);
        // Select all event cards within the #events-listing container
        $('#events-listing .events-listing__item').each(async (i, elem) => {
          const eventLinkElem = $(elem).find('a.event-card');
          if (eventLinkElem.length > 0) {
            const date = eventLinkElem.find('p').first().text().trim();
            const title = eventLinkElem.find('h3').text().trim();
            // Extract time from the <p> that contains a clock icon
            let time = eventLinkElem.find('p:has(span.icon-du-clock)').text().trim();
  
            // Get the URL to the event detail page
            let eventUrl = eventLinkElem.attr('href');
            if (eventUrl && !eventUrl.startsWith('http')) {
              eventUrl = 'https://www.du.edu' + eventUrl;
            }
  
            // Fetch the description from the event details page
            let description = '';
            if (eventUrl) {
              description = await fetchEventDescription(eventUrl);
            }
  
            let eventObj = { title, date };
            if (time) {
              eventObj.time = time;
            }
            if (description) {
              eventObj.description = description;
            }
  
            allEvents.push(eventObj);
          }
        });
        // Wait a bit between month requests if needed (optional)
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`Error fetching events for month starting ${start}: ${err.message}`);
      }
    }
  
    // Since we used an asynchronous loop inside .each, wait a few seconds before writing output.
    // In production, you might want to collect promises and await them properly.
    setTimeout(async () => {
      await fs.ensureDir('results');
      await fs.writeJson('results/calendar_events.json', { events: allEvents }, { spaces: 2 });
      console.log('Calendar events scraping complete. Results saved to results/calendar_events.json');
    }, 5000);
  }

// Ensure the results directory exists, then run all tasks sequentially.
async function main() {
  try {
    await fs.ensureDir('results');
    // await scrapeBulletin();
    await scrapeAthleticEvents();
    // await scrapeCalendarEvents();
  } catch (err) {
    console.error('Error in main function:', err.message);
  }
}

main();
