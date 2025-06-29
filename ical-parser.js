
// Unfolds iCal lines. A line starting with a space is a continuation of the previous line.
function unfold(icalData) {
    return icalData.replace(/\r\n /g, '');
}

function parseICal(icalData) {
    const unfoldedData = unfold(icalData);
    const events = [];
    const eventBlocks = unfoldedData.split('BEGIN:VEVENT');
    eventBlocks.shift();

    for (const block of eventBlocks) {
        const lines = block.split(/\r\n|\n/);
        const event = {};
        for (const line of lines) {
            const parts = line.split(':');
            const key = parts[0].split(';')[0]; // Ignore params like ;VALUE=DATE
            const value = parts.slice(1).join(':');

            switch (key) {
                case 'UID':
                    event.uid = value.trim();
                    break;
                case 'DTSTART':
                    event.dtstart = value.trim();
                    break;
                case 'DTEND':
                    event.dtend = value.trim();
                    break;
                case 'SUMMARY':
                    event.summary = value.trim();
                    break;
                case 'DESCRIPTION':
                    event.description = value.replace(/\\n/g, '\n').trim();
                    break;
                case 'END':
                    if (value.trim() === 'VEVENT' && event.uid && event.dtstart && event.dtend) {
                        events.push(event);
                    }
                    break;
            }
        }
    }
    return events;
}

function parseDate(dateStr) {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    const cleanDateStr = dateStr.trim().split('T')[0];
    const year = cleanDateStr.substring(0, 4);
    const month = cleanDateStr.substring(4, 6);
    const day = cleanDateStr.substring(6, 8);
    return `${year}-${month}-${day}`;
}

function getGuestName(event) {
    // Ignore common non-guest summaries from Airbnb, Booking.com, etc.
    const ignoredSummaries = ['reserved', 'not available', 'closed', 'bloqueado', 'cerrado'];
    const summaryLower = event.summary?.toLowerCase() || '';

    if (ignoredSummaries.some(ignored => summaryLower.includes(ignored))) {
        return null; // This indicates it's a blocked date, not a reservation
    }

    if (event.description) {
        const guestMatch = event.description.match(/GUEST:\s*(.*?)(\\n|$)/i);
        if (guestMatch && guestMatch[1]) {
            return guestMatch[1].trim();
        }
    }
    if (event.summary) {
        const cleanedSummary = event.summary.replace(/\(.*\)/, '').trim();
        if (cleanedSummary) {
            return cleanedSummary;
        }
    }
    return 'Reservado';
}

export function processICalData(icalData, source) {
    const events = parseICal(icalData);
    const reservations = [];

    for (const event of events) {
        const guestName = getGuestName(event);
        // Only process events that are actual reservations (have a guest name)
        if (guestName) {
            reservations.push({
                id: event.uid,
                guestName: guestName,
                checkIn: parseDate(event.dtstart),
                checkOut: parseDate(event.dtend),
                source: source,
                totalPaid: 0,
                commission: 0,
                taxes: 0,
            });
        }
    }
    return reservations;
}
