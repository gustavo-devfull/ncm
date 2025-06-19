import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ToastContainer, toast } from 'react-toastify';
import { Button, Table, Form, ProgressBar, InputGroup } from 'react-bootstrap';

const formatNCM = (value) => {
  if (!value) return '';
  const digits = value.toString().replace(/\D/g, '').padStart(8, '0');
  return `${digits.slice(0,4)}.${digits.slice(4,6)}.${digits.slice(6,8)}`;
};

const formatCEST = (value) => {
  if (!value) return '';
  const digits = value.toString().replace(/\D/g, '').padStart(7, '0');
  return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,7)}`;
};

const displayDate = (value) => {
  if (!value) return '';
  if (!isNaN(value) && Number(value) > 59) {
    const excelEpoch = Date.parse('1899-12-30');
    const date = new Date(excelEpoch + (value - 1) * 24 * 60 * 60 * 1000);
    return date.toLocaleDateString('pt-BR');
  }
  if (typeof value === 'string' && value.includes('/')) {
    const parts = value.split('/');
    if (parts.length === 3) {
      const [mm, dd, yyyy] = parts;
      return `${parseInt(dd)}/${parseInt(mm)}/${yyyy}`;
    }
  }
  const d = new Date(value);
  return isNaN(d) ? value : d.toLocaleDateString('pt-BR');
};

const inputDate = (value) => {
  if (!value) return '';
  if (!isNaN(value) && Number(value) > 59) {
    const excelEpoch = Date.parse('1899-12-30');
    const date = new Date(excelEpoch + (value - 1) * 24 * 60 * 60 * 1000);
    return date.toISOString().split('T')[0];
  }
  if (typeof value === 'string' && value.includes('/')) {
    const parts = value.split('/');
    if (parts.length === 3) {
      const [mm, dd, yyyy] = parts;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
  }
  const d = new Date(value);
  return isNaN(d) ? '' : d.toISOString().split('T')[0];
};

const formatUSD = (value) => {
  if (!value) return 'US$ 0,00';
  const num = parseFloat(value.toString().replace(',', '.'));
  if (isNaN(num)) return 'US$ 0,00';
  return `US$ ${num.toFixed(2).replace('.', ',')}`;
};

export default function ExcelDashboard() {
  const [data, setData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [progress, setProgress] = useState(0);
  const [searchNCM, setSearchNCM] = useState('');
  const [newRow, setNewRow] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  const ncmRef = collection(db, 'ncm');

  const headersOrder = [
    "NCM",
    "ultima atualização",
    "CEST",
    "IVA",
    "II",
    "IPI",
    "PIS",
    "COFINS",
    "ICMS",
    "USD_KG",
    "Santos",
    "Itajai"
  ];

  const headerMap = {
    "NCM": "NCM",
    "ultima atualização": "ultima atualização",
    "CEST": "CEST",
    "IVA": "IVA",
    "II": "II",
    "IPI": "IPI",
    "PIS": "PIS",
    "COFINS": "COFINS",
    "ICMS": "ICMS",
    "USD_KG": "U$/KG",
    "Santos": "Santos",
    "Itajai": "Itajai"
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const snapshot = await getDocs(ncmRef);
    const rows = snapshot.docs.map(doc => ({
      id: doc.id,
      editMode: false,
      ...doc.data()
    }));
    setHeaders(headersOrder);
    setData(rows);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) {
      toast.error("Selecione um arquivo válido!");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const json = XLSX.utils.sheet_to_json(ws, { header: 1 });

        const headersRow = json[1];

        const snapshot = await getDocs(ncmRef);
        const existingNCMs = {};
        snapshot.docs.forEach(docSnap => {
          const ncm = docSnap.data().NCM;
          if (ncm) existingNCMs[ncm] = docSnap.id;
        });

        const rows = json.slice(2)
          .map(row => {
            const obj = {};
            headersOrder.forEach(h => {
              const excelHeader = headerMap[h] || h;
              const index = headersRow.findIndex(x => x?.toString().trim() === excelHeader);
              let val = index !== -1 ? row[index] : '';

              if ((h === "Santos" || h === "Itajai") && (val === '' || val == null)) {
                val = "0%";
              }

              const percentFields = ["IVA","II","IPI","PIS","COFINS","ICMS","Santos","Itajai"];
              if (percentFields.includes(h)) {
                if (typeof val === 'number') {
                  val = (val < 1 ? (val * 100).toFixed(2).replace('.', ',') : val.toString().replace('.', ',')) + '%';
                } else if (typeof val === 'string' && val && !val.includes('%')) {
                  val = val.replace('.', ',') + '%';
                }
              }

              if (h === "USD_KG" && typeof val === 'string') {
                val = val.replace(',', '.');
              }

              obj[h] = val ?? '';
            });
            return obj;
          })
          .filter(r => {
            const ncmStr = (r.NCM ?? '').toString().trim();
            return ncmStr !== '' && ncmStr !== '0';
          });

        let count = 0;
        for (const row of rows) {
          const ncm = row.NCM;
          if (existingNCMs[ncm]) {
            const docRef = doc(db, 'ncm', existingNCMs[ncm]);
            await updateDoc(docRef, row);
          } else {
            await addDoc(ncmRef, row);
          }
          count++;
          setProgress(Math.round((count / rows.length) * 100));
        }

        toast.success("Importação concluída com sucesso!");
        loadData();
        setProgress(0);
      } catch (error) {
        console.error(error);
        toast.error("Erro na importação.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleEditToggle = (idx) => {
    const newData = data.map((row, i) =>
      i === idx ? { ...row, editMode: !row.editMode } : row
    );
    setData(newData);
  };

  const handleSave = async (row) => {
    const { id, editMode, ...fields } = row;
    const safeFields = {};
    headersOrder.forEach(h => safeFields[h] = fields[h] ?? '');
    const docRef = doc(db, 'ncm', id);
    await updateDoc(docRef, safeFields);
    toast.success("Registro atualizado!");
    const newData = data.map(d => d.id === id ? { ...d, editMode: false } : d);
    setData(newData);
  };

  const handleFieldChange = (idx, field, value) => {
    const newData = [...data];
    newData[idx][field] = value;
    setData(newData);
  };

  const handleDelete = async (id) => {
    const docRef = doc(db, 'ncm', id);
    await deleteDoc(docRef);
    toast.success("Registro excluído!");
    loadData();
  };

  const handleDeleteAll = async () => {
    if (!window.confirm("Tem certeza que deseja excluir TODOS os registros?")) return;
    const snapshot = await getDocs(ncmRef);
    const batch = snapshot.docs.map(docSnap => deleteDoc(doc(db, 'ncm', docSnap.id)));
    await Promise.all(batch);
    toast.success("Todos os registros foram excluídos!");
    loadData();
  };

  const handleExport = () => {
    const exportData = data.map(({ id, editMode, ...rest }) => {
      const obj = {};
      headersOrder.forEach(h => obj[h] = rest[h] ?? '');
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "NCM");
    XLSX.writeFile(wb, "NCM_export.xlsx");
  };

  const filteredData = [...data]
    .filter(row => row["NCM"]?.toString().includes(searchNCM))
    .sort((a, b) => {
      const ncmA = (a["NCM"] || '').toString();
      const ncmB = (b["NCM"] || '').toString();
      return sortAsc ? ncmA.localeCompare(ncmB) : ncmB.localeCompare(ncmA);
    });

  return (
    <div className="container my-4">
      <h1>NCM - Tabela de Nomenclatura e Impostos</h1>

      <input
        type="file"
        accept=".xlsx, .xls"
        id="importFile"
        onChange={handleImport}
        style={{ display: 'none' }}
      />
      <label htmlFor="importFile" className="btn btn-primary me-2">
        Importar Planilha
      </label>

      <Button variant="success" onClick={handleExport}>Exportar Excel</Button>
      <Button variant="danger" className="ms-2" onClick={handleDeleteAll}>
        Excluir Todos
      </Button>
      <Button variant="primary" className="ms-2" onClick={() => setNewRow({})}>
        Adicionar Novo
      </Button>

      <InputGroup className="my-3">
        <InputGroup.Text>Buscar por NCM</InputGroup.Text>
        <Form.Control
          placeholder="Digite o NCM..."
          value={searchNCM}
          onChange={e => setSearchNCM(e.target.value)}
        />
        <Button
          variant="secondary"
          className="ms-2"
          onClick={() => setSortAsc(!sortAsc)}
        >
          Ordenar NCM: {sortAsc ? 'Crescente' : 'Decrescente'}
        </Button>
      </InputGroup>

      {progress > 0 && progress < 100 && (
        <ProgressBar striped now={progress} label={`${progress}%`} className="my-3"/>
      )}

      <Table bordered hover size="sm" responsive>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h === "USD_KG" ? "U$/KG" : h}</th>
            ))}
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {newRow && (
            <tr>
              {headers.map((h, i) => (
                <td key={i}>
                  {h === "ultima atualização" ? (
                    <Form.Control
                      size="sm"
                      type="date"
                      value={newRow[h] || ''}
                      onChange={(e) => setNewRow({ ...newRow, [h]: e.target.value })}
                    />
                  ) : (
                    <Form.Control
                      size="sm"
                      value={newRow[h] || ''}
                      onChange={(e) => setNewRow({ ...newRow, [h]: e.target.value })}
                    />
                  )}
                </td>
              ))}
              <td>
                <Button
                  variant="success"
                  size="sm"
                  onClick={async () => {
                    try {
                      const safeRow = {};
                      headersOrder.forEach(h => safeRow[h] = newRow[h] ?? '');
                      await addDoc(ncmRef, safeRow);
                      toast.success("Novo registro adicionado!");
                      setNewRow(null);
                      loadData();
                    } catch (err) {
                      console.error(err);
                      toast.error("Erro ao adicionar.");
                    }
                  }}
                >
                  Salvar Novo
                </Button>{' '}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setNewRow(null)}
                >
                  Cancelar
                </Button>
              </td>
            </tr>
          )}

          {filteredData.map((row, idx) => (
            <tr key={row.id}>
              {headers.map((h, i) => (
                <td
          key={i}
          className={h === "IPI" && !row.editMode ? "fw-bold" : ""}
        >
                  {row.editMode ? (
                    h === "ultima atualização" ? (
                      <Form.Control
                        size="sm"
                        type="date"
                        value={inputDate(row[h] ?? '')}
                        onChange={(e) => handleFieldChange(idx, h, e.target.value)}
                      />
                    ) : (
                      <Form.Control
                        size="sm"
                        value={row[h] ?? ''}
                        onChange={(e) => handleFieldChange(idx, h, e.target.value)}
                      />
                    )
                  ) : (
                    (() => {
                      const raw = row[h];
                      switch (h) {
                        case "NCM": return formatNCM(raw);
                        case "CEST": return formatCEST(raw);
                        case "ultima atualização": return displayDate(raw);
                        case "USD_KG": return formatUSD(raw);
                        case "IVA": case "II": case "IPI": case "PIS": case "COFINS": case "ICMS": case "Santos": case "Itajai":
                          return raw?.toString();
                        default: return raw;
                      }
                    })()
                  )}
                </td>
              ))}
              <td>
                {row.editMode ? (
                  <Button variant="success" size="sm" onClick={() => handleSave(row)}>Salvar</Button>
                ) : (
                  <Button variant="warning" size="sm" onClick={() => handleEditToggle(idx)}>Editar</Button>
                )}{' '}
                <Button variant="danger" size="sm" onClick={() => handleDelete(row.id)}>Excluir</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <ToastContainer />
    </div>
  );
}
