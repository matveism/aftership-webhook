const fetch = require('node-fetch');

exports.handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const trackingNumber = body.tracking_number;

    if (!trackingNumber) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          meta: { code: 400, message: 'Missing tracking_number' } 
        })
      };
    }

    // YOUR GOOGLE SHEETS CSV URL - REPLACE THIS!
    const csvUrl = 'https://docs.google.com/spreadsheets/d/12GZO7YJU-VP3jWDekHqzeWwH3rYSwqzwsKbq6UuiEYg/gviz/tq?tqx=out:csv&sheet=Sheet1';

    console.log('Fetching CSV from:', csvUrl);
    console.log('Looking for tracking number:', trackingNumber);

    // Fetch CSV data
    const response = await fetch(csvUrl);
    const csvText = await response.text();

    console.log('CSV data received:', csvText.substring(0, 200) + '...');

    // Parse CSV
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    console.log('CSV Headers:', headers);

    // Find tracking data
    let trackingData = null;
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(cell => cell.trim().replace(/"/g, ''));
      console.log(`Checking row ${i}:`, row[0]);
      
      if (row[0] === trackingNumber) {
        trackingData = {};
        headers.forEach((header, index) => {
          trackingData[header] = row[index] || '';
        });
        console.log('Found tracking data:', trackingData);
        break;
      }
    }

    if (!trackingData) {
      console.log('Tracking number not found:', trackingNumber);
      return {
        statusCode: 404,
        body: JSON.stringify({ 
          meta: { code: 404, message: 'Tracking not found' } 
        })
      };
    }

    // Format response for AfterShip
    const aftershipResponse = {
      meta: { code: 200 },
      data: {
        tracking: {
          id: trackingData.TrackingID || trackingNumber,
          tracking_number: trackingData.TrackingID || trackingNumber,
          tag: mapStatusToTag(trackingData.Status),
          subtag: trackingData.Status || 'Unknown',
          origin_country: null,
          destination_country: null,
          checkpoints: [
            {
              slug: "custom-carrier",
              city: trackingData.Location || 'Unknown',
              message: trackingData.Status || 'Status unknown',
              checkpoint_time: formatDateTime(trackingData.Date, trackingData.Time),
              country: null,
              tag: mapStatusToTag(trackingData.Status),
              subtag: trackingData.Status || 'Unknown',
              raw_message: `Location: ${trackingData.Location || 'Unknown'}, Status: ${trackingData.Status || 'Unknown'}`
            }
          ]
        }
      }
    };

    console.log('Sending response to AfterShip:', JSON.stringify(aftershipResponse, null, 2));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(aftershipResponse)
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        meta: { code: 500, message: 'Internal Server Error: ' + error.message } 
      })
    };
  }
};

// Helper function to map your status to AfterShip tags
function mapStatusToTag(status) {
  if (!status) return 'Unknown';
  
  const statusMap = {
    'delivered': 'Delivered',
    'delivery': 'Delivered',
    'shipped': 'InTransit',
    'in transit': 'InTransit',
    'transit': 'InTransit',
    'pending': 'InfoReceived',
    'exception': 'Exception',
    'failed': 'Exception',
    'out for delivery': 'OutForDelivery',
    'ready for pickup': 'ReadyForPickup',
    'picked up': 'ReadyForPickup',
    'dispatched': 'InTransit',
    'processing': 'InfoReceived'
  };

  const lowerStatus = status.toLowerCase().trim();
  return statusMap[lowerStatus] || 'InfoReceived';
}

// Helper to format date and time for AfterShip
function formatDateTime(date, time) {
  try {
    if (!date) return new Date().toISOString();
    
    let dateTimeStr = date.trim();
    
    // Add time if available
    if (time && time.trim()) {
      dateTimeStr += `T${time.trim()}`;
    } else {
      dateTimeStr += 'T12:00:00'; // Default time if not provided
    }
    
    // Add timezone if not present
    if (!dateTimeStr.includes('Z') && !dateTimeStr.includes('+')) {
      dateTimeStr += 'Z';
    }
    
    const parsedDate = new Date(dateTimeStr);
    return isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
  } catch (error) {
    console.error('Date parsing error:', error);
    return new Date().toISOString();
  }
}
