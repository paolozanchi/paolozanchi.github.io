/*jshint esversion: 9 */
// Helper Functions  -----------------------------
function isValidRow(row) {
    return row.Importo != undefined;
}

function isRisparmio(row) {
    return row.causale == 'GIROCONTO AUTOMATICO' || row.descrizioneOperazione.toUpperCase().includes("IT66M0344501000000057023682");
}

function isUscita(row) {
    return row.importo < 0 && !isRisparmio(row);
}

function isEntrata(row) {
    return row.importo > 0;
}

function formatData(item, format = 'DD/MM/YYYY') {
    let date = moment(item, format, true).format();

    if(date == 'Invalid date') {
        // Disattivo strict mode
        date = moment(item, format, false).format();
    }
    
    return date;
}

function formatImporto(item) {
    let formattedItem = item.replace('&euro; ', '').replace('.', '').replace(',', '');

    return parseInt(formattedItem) || 0;
}

// Logic -----------------------------
function processaFileING(sheetJson) {
    return sheetJson.filter(isValidRow).map(item => {
        let reformattedObj = {};
        
        //reformattedObj.dataContabile = formatData(item['Data contabile']);
        reformattedObj.dataValuta = formatData(item['Data valuta']);
        reformattedObj.importo = formatImporto(item['Importo']);
        reformattedObj.descrizioneOperazione = item['Descrizione operazione'];
        reformattedObj.causale = item['Causale'];

        return reformattedObj;
    }).sort(function(a, b) {
        if (moment(a.dataValuta).isBefore(b.dataValuta)) return -1;
        if (moment(a.dataValuta).isAfter(b.dataValuta)) return 1;
        if (a.importo > b.importo) return -1;
        if (a.importo < b.importo) return 1;
        
        return 0;
    });
}

function getSommaEntrate(arr) {
    return arr.filter(isEntrata).reduce((acc, cur) => acc += cur.importo, 0);
}

function getSommaUscite(arr) {
    return arr.filter(isUscita).reduce((acc, cur) => acc += cur.importo, 0);
}

function getSommaRisparmi(arr) {
    return arr.filter(isRisparmio).reduce((acc, cur) => acc += cur.importo, 0);
}

function getRangeDate(arr) {
    let dataMin = new Date("9999-12-31"), dataMax = new Date("0000-01-01");

    arr.forEach(cur => {
        if(moment(cur.dataValuta).isBefore(dataMin)) dataMin = cur.dataValuta;
        if(moment(cur.dataValuta).isAfter(dataMax)) dataMax = cur.dataValuta;
    });

    return {start: moment(dataMin).format("YYYY-MM-DD"), end: moment(dataMax).format("YYYY-MM-DD")};
}

let JSONresult = [];

$('#input-excel').change(function(e) {
    let selectedFile = e.target.files[0];

    var reader = new FileReader();

    reader.onload = function(event) {
        var data = event.target.result;
        var workbook = XLSX.read(data, {
            type: 'binary'
        });

        let first_sheet_name = workbook.SheetNames[0];
        let worksheet = workbook.Sheets[first_sheet_name];
        let sheetJson = XLSX.utils.sheet_to_json(worksheet, {raw: false});
        
        // Filtro le sole righe valide e rimappo i campi.
        JSONresult = JSONresult.concat(processaFileING(sheetJson));
        
        $('#totaleEntrate').text(getSommaEntrate(JSONresult) / 100);
        $('#totaleUscite').text(getSommaUscite(JSONresult) / 100);
        $('#totaleRisparmi').text(getSommaRisparmi(JSONresult) / 100);
        
        let dateRange = getRangeDate(JSONresult);
        
        $('#dataDa').prop("min", dateRange.start);
        $('#dataDa').val(dateRange.start);
        $('#dataA').prop("max", dateRange.end);
        $('#dataA').val(dateRange.end);

        // Assegno le categorie in base alle regole.
        JSONresult = assegnaCategorie(JSONresult);
        console.log("categorie", JSONresult);
    
        // Load the Visualization API
        google.charts.load('current', {packages:['corechart']});
        // Set a callback to run when the Google Visualization API is loaded.
        google.charts.setOnLoadCallback(drawLineChart);
        google.charts.setOnLoadCallback(drawPieChart);
    };

    reader.onerror = function(event) {
        console.error('File could not be read! Code', event.target.error.code);
    };

    reader.readAsBinaryString(selectedFile);
});

// Callback that creates and populates a data table, 
// instantiates the chart, passes in the data and draws it.
function drawLineChart() {
    // Create the data table.
    let data = [], somma = 0;
    data.push(['Data Valuta', 'Importo', 'Somma']);

    JSONresult.forEach(cur => {
        data.push([
            moment(cur.dataValuta).format("MM-DD"),
            cur.importo / 100,
            somma += cur.importo/100
        ]);
    });

    data = google.visualization.arrayToDataTable(data);

    // Set chart options
    var options = {
        animation: {
            duration: 1000,
            easing: 'out',
            startup: true
        }
    };

    // Instantiate and draw our chart, passing in some options.
    var chart = new google.visualization.LineChart(document.getElementById('lineChart_div'));
    chart.draw(data, options);
}

function drawPieChart() {
    let datatable = new google.visualization.DataTable();
    datatable.addColumn('string', 'Categoria');
    datatable.addColumn('number', '€');
    
    let sommaPerCategorie = JSONresult.filter(isUscita).reduce((acc, cur) => {
        acc[cur.superCategoria] = (acc[cur.superCategoria] || 0) + (cur.importo * -1);
        return acc;
    }, []);

    // let sommaPerCategorie = JSONresult.filter(isUscita).reduce((acc, cur) => {
    //     if (!(cur.categoria in acc))
    //         acc.__array.push(acc[cur.categoria] = cur);
    //     else {
    //         acc[cur.categoria].importo += cur.importo;
    //     }
    //     return acc;
    // }, {__array:[]}).__array;

    console.log("sommaPerCategorie", sommaPerCategorie);
    datatable.addRows([
        ['AFFITTO', 384000],
        ['AUTOMOBILE', 97071],
        ['SUPERMERCATI', 90967],
        ['RISTORANTI', 59940],
        ['CARTA_CREDITO', 50286],
        ['BOLLETTE', 50262],
        ['PAYPAL', 38888],
        ['ACQUISTI', 15253],
        ['undefined', 123747]
    ]);

    // Instantiate and draw our chart, passing in some options.
    chart = new google.visualization.PieChart(document.getElementById('pieChart_div'));
    chart.draw(datatable, {});
}

function assegnaCategorie(arr) {
    return arr.map(e => {
        let _categoria, _superCategoria;

        // Supermercati
        if (e.descrizioneOperazione.toUpperCase().includes("CONAD")) {_categoria = "CONAD"; _superCategoria = "SUPERMERCATI";}
        if (e.descrizioneOperazione.toUpperCase().includes("ESSELUNGA")) {_categoria = "ESSELUNGA"; _superCategoria = "SUPERMERCATI";}
        if (e.descrizioneOperazione.toUpperCase().includes("AUCHAN")) {_categoria = "AUCHAN"; _superCategoria = "SUPERMERCATI";}
        if (e.descrizioneOperazione.toUpperCase().includes("CARREFOUR")) {_categoria = "CARREFOUR"; _superCategoria = "SUPERMERCATI";}

        // Casa
        if (e.descrizioneOperazione.toUpperCase().includes("AFFITTO")) {_categoria = "AFFITTO"; _superCategoria = "AFFITTO";}
        if (e.descrizioneOperazione.toUpperCase().includes("SERVIZIO ELETTRICO NAZIONALE")) {_categoria = "BOLLETTA_LUCE"; _superCategoria = "BOLLETTE";}
        if (e.descrizioneOperazione.toUpperCase().includes("E.ON ENERGIA")) {_categoria = "BOLLETTA_GAS"; _superCategoria = "BOLLETTE";}
        // TODO Aggiungere TARI
        
        // Automobile
        if (e.descrizioneOperazione.toUpperCase().includes("METANO")) {_categoria = "METANO"; _superCategoria = "AUTOMOBILE";}
        if (e.descrizioneOperazione.toUpperCase().includes(" ENI ")) {_categoria = "RIFORNIMENTO"; _superCategoria = "AUTOMOBILE";}
        if (e.descrizioneOperazione.toUpperCase().includes("DISTRIBUTORE ESSO")) {_categoria = "RIFORNIMENTO"; _superCategoria = "AUTOMOBILE";}
        if (e.descrizioneOperazione.toUpperCase().includes("IPER STATION")) {_categoria = "RIFORNIMENTO"; _superCategoria = "AUTOMOBILE";}
        if (e.descrizioneOperazione.toUpperCase().includes("TOURAN")) {_categoria = "SPESE TOURAN"; _superCategoria = "AUTOMOBILE";}
        if (e.descrizioneOperazione.toUpperCase().includes("NORAUTO")) {_categoria = "NORAUTO"; _superCategoria = "AUTOMOBILE";}
        if (e.descrizioneOperazione.toUpperCase().includes("AUTOST")) {_categoria = "AUTOSTRADA"; _superCategoria = "AUTOMOBILE";}
        if (e.descrizioneOperazione.toUpperCase().includes("ASPI")) {_categoria = "AUTOSTRADA"; _superCategoria = "AUTOMOBILE";}
        // TODO aggiungere parcheggi

        // Ristoranti
        if (e.descrizioneOperazione.toUpperCase().includes("AL PORTICO")) {_categoria = "AL PORTICO"; _superCategoria = "RISTORANTI";}
        if (e.descrizioneOperazione.toUpperCase().includes("NUTOPIA")) {_categoria = "EDONE"; _superCategoria = "RISTORANTI";}
        if (e.descrizioneOperazione.toUpperCase().includes("TASSINO EVENTI SRL")) {_categoria = "EDONE"; _superCategoria = "RISTORANTI";}
        if (e.descrizioneOperazione.toUpperCase().includes("AMERICA GRAFFITI")) {_categoria = "AMERICA GRAFFITI"; _superCategoria = "RISTORANTI";}
        if (e.descrizioneOperazione.toUpperCase().includes("MCDONALD")) {_categoria = "MCDONALDS"; _superCategoria = "RISTORANTI";}
        if (e.descrizioneOperazione.toUpperCase().includes("ROADHOUSE")) {_categoria = "ROADHOUSE"; _superCategoria = "RISTORANTI";}
        if (e.descrizioneOperazione.toUpperCase().includes("AUTOGRILL")) {_categoria = "AUTOGRILL"; _superCategoria = "RISTORANTI";}
        if (e.descrizioneOperazione.toUpperCase().includes("NEW ERA DI LORENZI CLAUDI")) {_categoria = "APERITIVO"; _superCategoria = "RISTORANTI";}
        if (e.descrizioneOperazione.toUpperCase().includes("FOOD EOLIANA DI CANDURA D")) {_categoria = "GELATERIA"; _superCategoria = "RISTORANTI";}
        if (e.descrizioneOperazione.toUpperCase().includes("MISCUSI")) {_categoria = "MISCUSI"; _superCategoria = "RISTORANTI";}
        if (e.descrizioneOperazione.toUpperCase().includes("OKAI")) {_categoria = "OKAI"; _superCategoria = "RISTORANTI";}
        if (e.descrizioneOperazione.toUpperCase().includes("GUNE' RISTORANTE")) {_categoria = "GUNE'"; _superCategoria = "RISTORANTI";}
        if (e.descrizioneOperazione.toUpperCase().includes("TRATTORIA LA PESA")) {_categoria = "LA PESA"; _superCategoria = "RISTORANTI";}

        // Acquisti una tantum
        if (e.descrizioneOperazione.toUpperCase().includes("AMAZON")) {_categoria = "AMAZON"; _superCategoria = "ACQUISTI";}
        if (e.descrizioneOperazione.toUpperCase().includes("LEROY MERLIN")) {_categoria = "LEROY MERLIN"; _superCategoria = "ACQUISTI";}
        if (e.descrizioneOperazione.toUpperCase().includes("DECATHLON")) {_categoria = "DECATHLON"; _superCategoria = "ACQUISTI";}
        if (e.descrizioneOperazione.toUpperCase().includes("MEDIAWORLD")) {_categoria = "MEDIAWORLD"; _superCategoria = "ACQUISTI";}
        if (e.descrizioneOperazione.toUpperCase().includes("FINLIBRI")) {_categoria = "FINLIBRI"; _superCategoria = "ACQUISTI";}


        // Carta di credito
        if (e.descrizioneOperazione.toUpperCase().includes("CARTA DI CREDITO")) {_categoria = "CARTA_CREDITO"; _superCategoria = "CARTA_CREDITO";}

        // Paypal
        if (e.descrizioneOperazione.toUpperCase().includes("PAYPAL")) {_categoria = "PAYPAL"; _superCategoria = "PAYPAL";}

        // Giroconto
        if (e.descrizioneOperazione.toUpperCase().includes("GIROCONTO AUTOMATICO")) {_categoria = "GIROCONTO"; _superCategoria = "RISPARMI";}

        return {
            ...e,
            categoria: _categoria || "UNDEFINED",
            superCategoria: _superCategoria || "UNDEFINED"
        };
    });
}

JSONresult.filter((x) => x.categoria == 'UNDEFINED')