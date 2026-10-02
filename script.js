    // ⚠️ URL /exec della tua Web App Apps Script
    const URL_API = "https://script.google.com/macros/s/AKfycbxAuUC0_l5nRSPXbPdcGHsj-1n0YSxU-hlTPWx3lvLo0h9dppiFmdYED7_iJTPjZQ0K/exec";

    // ------------------------------------------------------------
    // FETCH CON TIMEOUT E RITENTATIVI AUTOMATICI
    // ------------------------------------------------------------
    // Le chiamate da GitHub Pages verso Apps Script (due domini diversi)
    // possono occasionalmente impuntarsi o essere lente (avvio "a freddo"
    // di Apps Script, intoppi di rete). Questa funzione:
    // 1) interrompe la richiesta dopo timeoutMs invece di lasciarla appesa
    // 2) in caso di fallimento, riprova automaticamente fino a tentativiMax volte,
    //    con una breve pausa crescente tra un tentativo e l'altro
    // Va usata SOLO per chiamate di sola lettura (GET): ripetere una scrittura
    // (POST di conferma prenotazione) rischierebbe di duplicarla.
    function fetchConRitentativi(url, timeoutMs, tentativiMax, alCambioStato) {
      function tentativo(numeroTentativo) {
        const controller = new AbortController();
        const timer = setTimeout(function() { controller.abort(); }, timeoutMs);

        // Dopo 5 secondi ancora in attesa, avvisa l'utente che il sistema
        // sta ancora lavorando (invece di lasciarlo con un messaggio statico
        // che sembra bloccato)
        const timerAvviso = setTimeout(function() {
          if (alCambioStato) alCambioStato('lento');
        }, 5000);

        return fetch(url, { signal: controller.signal })
          .then(function(risposta) {
            clearTimeout(timer);
            clearTimeout(timerAvviso);
            if (!risposta.ok) throw new Error('Risposta HTTP ' + risposta.status);
            return risposta.json();
          })
          .catch(function(errore) {
            clearTimeout(timer);
            clearTimeout(timerAvviso);
            if (numeroTentativo < tentativiMax) {
              if (alCambioStato) alCambioStato('ritento');
              const attesa = 800 * numeroTentativo; // pausa crescente: 800ms, 1600ms, ...
              return new Promise(function(resolve) { setTimeout(resolve, attesa); })
                .then(function() { return tentativo(numeroTentativo + 1); });
            }
            throw errore;
          });
      }
      return tentativo(1);
    }

    const statoPrenotazione = {
      tipoVisita: null,
      dataISO: null,
      etichettaData: null,
      oraInizio: null,
      nome: null,
      cognome: null,
      dataNascitaISO: null,
      etichettaDataNascita: null,
      email: null,
      telefono: null,
      disciplinaPraticata: null
    };

    let passoCorrente = 1;

    function mostraErrore(messaggio) {
      const el = document.getElementById('messaggioErrore');
      el.textContent = messaggio;
      el.classList.add('visibile');
    }

    function nascondiErrore() {
      document.getElementById('messaggioErrore').classList.remove('visibile');
    }

    function aggiornaIndicatorePassi() {
      document.querySelectorAll('#indicatorePassi span').forEach(function(el) {
        const numeroPasso = parseInt(el.getAttribute('data-passo'), 10);
        el.classList.toggle('completato', numeroPasso <= passoCorrente);
      });
    }

    function vaAlPasso(numeroPasso) {
      nascondiErrore();
      document.querySelectorAll('.passo').forEach(function(el) { el.classList.remove('attivo'); });
      document.getElementById('passo' + numeroPasso).classList.add('attivo');
      passoCorrente = numeroPasso;
      aggiornaIndicatorePassi();
    }

    // --- PASSO 1 ---
    function selezionaTipoVisita(tipo) {
      statoPrenotazione.tipoVisita = tipo;
      document.querySelectorAll('#passo1 .scheda-tipo-visita').forEach(function(el) {
        el.classList.toggle('selezionata', el.getAttribute('data-tipo') === tipo);
      });
      caricaDateDisponibili();
      vaAlPasso(2);
    }

    // --- PASSO 2 ---
    function caricaDateDisponibili() {
      document.getElementById('contenitoreDate').innerHTML =
        '<div class="stato-caricamento">Carico le date disponibili…</div>';

      fetchConRitentativi(URL_API + '?azione=giorniDisponibili', 25000, 2, function(stato) {
          const el = document.getElementById('contenitoreDate');
          if (stato === 'lento') {
            el.innerHTML = '<div class="stato-caricamento">Ci sto ancora lavorando, un attimo…</div>';
          } else if (stato === 'ritento') {
            el.innerHTML = '<div class="stato-caricamento">Riprovo…</div>';
          }
        })
        .then(function(giorni) {
          if (giorni.errore) throw new Error(giorni.errore);
          mostraDateDisponibili(giorni);
        })
        .catch(function(errore) {
          mostraErrore('Non è stato possibile caricare le date disponibili. Riprova.');
        });
    }

    // Le card mostrano il giorno abbreviato (già in italiano, es. "Sab") sopra
    // e la data numerica (es. "19/09") sotto, ricavandoli dall'etichetta
    // "Sab 19/09" restituita dal server (vedi formattaEtichettaData in Codice.gs)
    function mostraDateDisponibili(giorni) {
      const contenitore = document.getElementById('contenitoreDate');

      if (!giorni || giorni.length === 0) {
        contenitore.innerHTML = '<div class="stato-vuoto">Al momento non ci sono date disponibili. Riprova più tardi.</div>';
        return;
      }

      contenitore.innerHTML = '';
      const griglia = document.createElement('div');
      griglia.className = 'griglia-date';

      giorni.forEach(function(giorno) {
        const parti = giorno.etichetta.split(' '); // es. ["Sab", "19/09"]
        const bottone = document.createElement('button');
        bottone.className = 'scheda-data';
        bottone.setAttribute('data-data-iso', giorno.dataISO);
        bottone.innerHTML =
          '<span class="giorno-settimana">' + parti[0] + '</span>' +
          '<span class="giorno-numero">' + parti[1] + '</span>';
        bottone.onclick = function() { selezionaData(giorno.dataISO, giorno.etichetta); };
        griglia.appendChild(bottone);
      });

      contenitore.appendChild(griglia);
    }

     function selezionaData(dataISO, etichetta) {
      statoPrenotazione.dataISO = dataISO;
      statoPrenotazione.etichettaData = etichetta;
    
      document.querySelectorAll('#contenitoreDate .scheda-data').forEach(function(el) {
        el.classList.toggle(
          'selezionata',
          el.getAttribute('data-data-iso') === dataISO
        );
      });
    
      // Mostra la data selezionata anche nel Passo 3
      document.getElementById('dataSelezionataOrari').textContent =
        etichetta;
    
      caricaOrariDisponibili();
      vaAlPasso(3);
    }

    // --- PASSO 3 ---
    function caricaOrariDisponibili() {
      document.getElementById('contenitoreOrari').innerHTML =
        '<div class="stato-caricamento">Carico gli orari disponibili…</div>';

      const parametri = '?azione=slotDisponibili' +
        '&dataISO=' + encodeURIComponent(statoPrenotazione.dataISO) +
        '&tipoVisita=' + encodeURIComponent(statoPrenotazione.tipoVisita);

      fetchConRitentativi(URL_API + parametri, 25000, 2, function(stato) {
          const el = document.getElementById('contenitoreOrari');
          if (stato === 'lento') {
            el.innerHTML = '<div class="stato-caricamento">Ci sto ancora lavorando, un attimo…</div>';
          } else if (stato === 'ritento') {
            el.innerHTML = '<div class="stato-caricamento">Riprovo…</div>';
          }
        })
        .then(function(orari) {
          if (orari.errore) throw new Error(orari.errore);
          mostraOrariDisponibili(orari);
        })
        .catch(function(errore) {
          mostraErrore('Non è stato possibile caricare gli orari disponibili. Riprova.');
        });
    }

    // Il server ora restituisce { mattina: [...], pomeriggio: [...] } invece di
    // un array unico: costruiamo un gruppo separato per ciascuno, saltando
    // quello vuoto (es. se la mattina è già tutta occupata)
    function mostraOrariDisponibili(orari) {
      const contenitore = document.getElementById('contenitoreOrari');
      const nessunOrario = (!orari) || (orari.mattina.length === 0 && orari.pomeriggio.length === 0);

      if (nessunOrario) {
        contenitore.innerHTML = '<div class="stato-vuoto">Nessun orario disponibile per questa data. Torna indietro e scegli un\'altra data.</div>';
        return;
      }

      contenitore.innerHTML = '';

      if (orari.mattina.length > 0) {
        contenitore.appendChild(creaGruppoOrari('Mattina', orari.mattina));
      }
      if (orari.pomeriggio.length > 0) {
        contenitore.appendChild(creaGruppoOrari('Pomeriggio', orari.pomeriggio));
      }
    }

    // Crea un blocco "Mattina" o "Pomeriggio" con titoletto + griglia di orari
    function creaGruppoOrari(titolo, elencoOrari) {
      const gruppo = document.createElement('div');
      gruppo.className = 'gruppo-orari';

      const titoloEl = document.createElement('div');
      titoloEl.className = 'titolo-gruppo-orari';
      titoloEl.textContent = titolo;
      gruppo.appendChild(titoloEl);

      const griglia = document.createElement('div');
      griglia.className = 'griglia-orari';

      elencoOrari.forEach(function(orario) {
        const bottone = document.createElement('button');
        bottone.className = 'orario-opzione';
        bottone.setAttribute('data-orario', orario);
        bottone.textContent = orario;
        bottone.onclick = function() { selezionaOrario(orario); };
        griglia.appendChild(bottone);
      });

      gruppo.appendChild(griglia);
      return gruppo;
    }

    function selezionaOrario(orario) {
      statoPrenotazione.oraInizio = orario;
      // Cerca tra TUTTI i bottoni orario della pagina (sia nel gruppo Mattina che Pomeriggio)
      document.querySelectorAll('#contenitoreOrari .orario-opzione').forEach(function(el) {
        el.classList.toggle('selezionata', el.getAttribute('data-orario') === orario);
      });
      vaAlPasso(4);
    }

    // --- PASSO 4 ---
    function validaDatiEProsegui() {
      const nome = document.getElementById('campoNome').value.trim();
      const cognome = document.getElementById('campoCognome').value.trim();
      const dataNascitaISO = document.getElementById('campoDataNascita').value;
      const email = document.getElementById('campoEmail').value.trim();
      const telefono = document.getElementById('campoTelefono').value.trim();
      const disciplinaPraticata = document.getElementById('campoDisciplina').value.trim();

      if (!nome || !cognome || !dataNascitaISO || !email || !telefono || !disciplinaPraticata) {
        mostraErrore('Compila tutti i campi per continuare.');
        return;
      }

      const formatoEmailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!formatoEmailValido) {
        mostraErrore('Inserisci un indirizzo email valido.');
        return;
      }

      nascondiErrore();
      statoPrenotazione.nome = nome;
      statoPrenotazione.cognome = cognome;
      statoPrenotazione.dataNascitaISO = dataNascitaISO;
      statoPrenotazione.etichettaDataNascita = formattaDataItaliana(dataNascitaISO);
      statoPrenotazione.email = email;
      statoPrenotazione.telefono = telefono;
      statoPrenotazione.disciplinaPraticata = disciplinaPraticata;

      mostraRiepilogo();
      vaAlPasso(5);
    }

    function formattaDataItaliana(dataISO) {
      const parti = dataISO.split('-');
      return parti[2] + '/' + parti[1] + '/' + parti[0];
    }

    // --- PASSO 5 ---
    function mostraRiepilogo() {
      const el = document.getElementById('riepilogoFinale');
      el.innerHTML =
        '<div class="riga"><span>Tipo visita</span><span>' + statoPrenotazione.tipoVisita + '</span></div>' +
        '<div class="riga"><span>Data</span><span>' + statoPrenotazione.etichettaData + '</span></div>' +
        '<div class="riga"><span>Orario</span><span>' + statoPrenotazione.oraInizio + '</span></div>' +
        '<div class="riga"><span>Nome</span><span>' + statoPrenotazione.nome + ' ' + statoPrenotazione.cognome + '</span></div>' +
        '<div class="riga"><span>Data di nascita</span><span>' + statoPrenotazione.etichettaDataNascita + '</span></div>' +
        '<div class="riga"><span>Email</span><span>' + statoPrenotazione.email + '</span></div>' +
        '<div class="riga"><span>Telefono</span><span>' + statoPrenotazione.telefono + '</span></div>' +
        '<div class="riga"><span>Disciplina praticata</span><span>' + statoPrenotazione.disciplinaPraticata + '</span></div>';
    }

    function inviaPrenotazione() {
      nascondiErrore();
      const bottone = document.getElementById('bottoneConferma');
      bottone.disabled = true;
      bottone.textContent = 'Invio in corso…';

      const datiDaInviare = {
        dataISO: statoPrenotazione.dataISO,
        tipoVisita: statoPrenotazione.tipoVisita,
        oraInizio: statoPrenotazione.oraInizio,
        nome: statoPrenotazione.nome,
        cognome: statoPrenotazione.cognome,
        dataNascitaISO: statoPrenotazione.dataNascitaISO,
        email: statoPrenotazione.email,
        telefono: statoPrenotazione.telefono,
        disciplinaPraticata: statoPrenotazione.disciplinaPraticata
      };

      // Timeout più generoso (20s) rispetto alle letture: la conferma include
      // scrittura sul foglio + evento calendario + 2 email, richiede più tempo.
      // NESSUN ritentativo automatico qui: se il primo tentativo fosse in
      // realtà riuscito lato server (solo la risposta si fosse persa), un
      // secondo invio automatico rischierebbe di creare una prenotazione doppia.
      const controller = new AbortController();
      const timer = setTimeout(function() { controller.abort(); }, 20000);

      fetch(URL_API, {
        method: 'POST',
        // Content-Type "text/plain" (invece di "application/json") evita che il
        // browser mandi una richiesta preflight OPTIONS, che Apps Script non gestisce.
        // Il corpo resta comunque testo JSON: lo interpretiamo così in doPost().
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(datiDaInviare),
        signal: controller.signal
      })
        .then(function(risposta) {
          clearTimeout(timer);
          if (!risposta.ok) {
            throw new Error('Errore HTTP ' + risposta.status);
          }
          return risposta.text();
        })
        .then(function(testo) {
          return JSON.parse(testo);
        })
        .then(gestisciRispostaConferma)
        .catch(function(errore) {
          clearTimeout(timer);
          bottone.disabled = false;
          bottone.textContent = 'Conferma prenotazione';
          if (errore.name === 'AbortError') {
            mostraErrore('La richiesta sta impiegando troppo tempo. Prima di riprovare, controlla la posta: potresti aver già ricevuto l\'email di conferma.');
          } else {
            mostraErrore('Si è verificato un errore imprevisto. Riprova.');
          }
        });
    }

    function gestisciRispostaConferma(risposta) {
      const bottone = document.getElementById('bottoneConferma');

      if (!risposta.successo) {
        bottone.disabled = false;
        bottone.textContent = 'Conferma prenotazione';
        mostraErrore(risposta.messaggio || 'Lo slot scelto non è più disponibile.');
        caricaOrariDisponibili();
        vaAlPasso(3);
        return;
      }

      document.getElementById('testoSuccesso').textContent =
        statoPrenotazione.tipoVisita + ' il ' + risposta.dettagli.etichettaData +
        ' alle ' + risposta.dettagli.oraInizio + '. Riceverai a breve un\'email di conferma.';

      document.querySelectorAll('.passo').forEach(function(el) { el.classList.remove('attivo'); });
      document.getElementById('passoSuccesso').classList.add('attivo');
      document.getElementById('indicatorePassi').style.display = 'none';
      document.getElementById('intestazionePrincipale').style.display = 'none';
    }

    // --- "PRENOTA UN'ALTRA VISITA" ---
    // Riporta la pagina esattamente allo stato iniziale, così si può
    // effettuare subito una nuova prenotazione senza ricaricare la pagina
    function ricominciaPrenotazione() {
      // 1) Svuota lo stato globale
      Object.keys(statoPrenotazione).forEach(function(chiave) {
        statoPrenotazione[chiave] = null;
      });

      // 2) Svuota tutti i campi del form (Passo 4)
      document.getElementById('campoNome').value = '';
      document.getElementById('campoCognome').value = '';
      document.getElementById('campoDataNascita').value = '';
      document.getElementById('campoEmail').value = '';
      document.getElementById('campoTelefono').value = '';
      document.getElementById('campoDisciplina').value = '';

      // 3) Toglie l'evidenziazione dalle card di tipo visita (Passo 1)
      document.querySelectorAll('#passo1 .scheda-tipo-visita').forEach(function(el) {
        el.classList.remove('selezionata');
      });

      // 4) Rimette i contenitori di date/orari nello stato "in caricamento",
      //    pronti per essere ripopolati alla prossima scelta del Passo 1
      document.getElementById('contenitoreDate').innerHTML =
        '<div class="stato-caricamento">Carico le date disponibili…</div>';
      document.getElementById('contenitoreOrari').innerHTML =
        '<div class="stato-caricamento">Carico gli orari disponibili…</div>';

      // 5) Riporta visibile l'header, l'indicatore di avanzamento, e torna al Passo 1
      document.getElementById('intestazionePrincipale').style.display = 'block';
      document.getElementById('indicatorePassi').style.display = 'flex';
      vaAlPasso(1);
    }
