const axios = require('axios');

const LUCKALOT_API_HOST = process.env.LUCKALOT_API_HOST || 'http://192.168.1.142:3001';
const LUCKALOT_SANOOK_API_HOST = process.env.LUCKALOT_SANOOK_API_HOST || 'http://192.168.1.142:3002';

exports.lambdaHandler = async (event, context) => {
    try {
        const date = event.date ? event.date : new Date().toISOString().slice(0, 10);
        const log = await importResultOrchestration(date);
        createImportResultLog(date, log);

        const code = log.is_success ? 200 : 500;
        return buildResponse(code, log)
    } catch (error) {
        console.error(error);
        const data = { error_name: 'internal_server_error', error_message: 'an unexpected error has occurred' };
        return buildResponse(500, data);
    }
};

function buildResponse(code, data) {
    return {
        statusCode: code,
        body: {
            code: code,
            data: data
        }
    }
}

async function importResultOrchestration(date) {
    const log = {
        is_success: false,
        total_records: 0,
        error_information: null,
        remark: null,
        created_by: 'luckalot-scheduler'
    }

    const step1 = await checkTodayIsScheduledToImportResult(date);
    if (step1.isError) {
        log.error_information = step1.message;
        return log;
    }
    if (!step1.isScheduled) {
        log.is_success = true;
        log.remark = step1.message;
        return log;
    }

    const step2 = await getResultFrom3rdParty(date);
    if (step2.isError) {
        log.error_information = step2.message;
        return log;
    }

    const step3 = await importResult(date, results);
    if (step3.isError) {
        log.error_information = step3.message;
        return log;
    }

    const step4 = await updateImportScheduleToBeCompleted(date);
    if (step4.isError) {
        log.error_information = step4.message;
        return log;
    }

    log.is_success = true;
    log.total_records = step3.importedResults.length;
    return log;
}

async function importResult(date, results) {
    const path = `results/${date}/bulk`;
    const url = `${LUCKALOT_API_HOST}/${path}`;

    const resultsToImport = results.data.map((value) => {
        value.created_by = 'luckalot-scheduler'
        return value;
    });

    let response;
    try {
        response = await axios.post(url, resultsToImport);
    }
    catch (error) {
        const message = `an error has occurred during perform 'POST ${path}' to upstream`;
        console.error(message);
        console.info(JSON.stringify(error));
        return { isError: true, message: message };
    }

    if (!response.data) {
        const message = `got unexpected response after perform 'POST ${path}' to upstream`;
        console.error(message);
        console.info(JSON.stringify(response));
        return { isError: true, message: message };
    }

    return { importedResults: response.data };
}

async function checkTodayIsScheduledToImportResult(date) {
    const path = 'result-import-schedules';
    const url = `${LUCKALOT_API_HOST}/${path}?date=${date}&is_completed=false&is_active=true`;
    let response;
    try {
        response = await axios.get(url);
    } catch (error) {
        const message = `an error has occurred during perform 'GET ${path}' from upstream`;
        console.error(message);
        console.info(JSON.stringify(error));
        return { isError: true, message: message };
    }

    if (!response || !response.data) {
        const message = `got unexpected response after perform 'GET ${path}' from upstream`;
        console.error(message);
        console.log(JSON.stringify(response));
        return { isError: true, message: message };
    }
    if (response.data.length === 0) {
        const message = `there is no schedule to import result or already done for today: ${date}`
        console.log(message);
        return { isScheduled: false, isError: false, message: message };
    }

    return { isScheduled: true };
}

async function getResultFrom3rdParty(date) {
    const path = 'results';
    const url = `${LUCKALOT_SANOOK_API_HOST}/${path}/${date}`;
    let response;
    try {
        response = await axios.get(url);
    }
    catch (error) {
        const message = `an error has occurred during perform 'GET ${path}' from upstream`;
        console.error(message);
        console.info(JSON.stringify(error));
        return { isError: true, message: message };
    }

    if (!response || !response.data || response.data.length == 0) {
        const message = `got unexpected response after perform 'GET ${path}' from upstream`;
        console.error(message);
        console.info(JSON.stringify(response));
        return { isError: true, message: message };
    }

    return { results: response.data };
}

async function updateImportScheduleToBeCompleted(date) {
    const path = `result-import-schedules/${date}`;
    const url = `${LUCKALOT_API_HOST}/${path}`;
    let response;
    try {
        response = await axios.patch(url, { is_completed: true });
    }
    catch (error) {
        const message = `an error has occurred during perform 'PATCH ${path}' to upstream`;
        console.error(message);
        console.info(JSON.stringify(error));
        return { isError: true, message: message };
    }

    if (!response || !response.data || response.data.is_completed === false) {
        const message = `got unexpected response after perform 'PATCH ${path}' to upstream`;
        console.error(message);
        console.info(JSON.stringify(response));
        return { isError: true, message: message };
    }

    return { isCompleted: true };
}

async function createImportResultLog(date, log) {
    const path = `result-import-logs/${date}`
    const url = `${LUCKALOT_API_HOST}/${path}`;
    try {
        await axios.post(url, log);
    }
    catch (error) {
        const message = `an error has occurred during perform 'POST ${path}' to upstream`;
        console.error(message);
        console.info(JSON.stringify(error));
        return { isError: true, message: message };
    }

    return { isCompleted: true };
}