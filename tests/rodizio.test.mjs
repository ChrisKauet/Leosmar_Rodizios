import * as r from "../lib/rodizio.mjs";
import assert from "node:assert";
assert.equal(r.visao(r.estadoInicial()).fila.map(t=>t.nome).join(","), r.TECNICOS_INICIAIS.join(","));
assert.deepEqual(r.estadoInicial().fila, r.estadoInicial().fila);
let e = r.estadoInicial([]);
for (const n of ["Ana","Beto","Caio","Duda"]) r.acaoCentral(e,{tipo:"adicionar",nome:n});
const id = n => e.tecnicos.find(t=>t.nome===n).id;
const nm = () => r.visao(e).fila.map(t=>t.nome).join(",");
assert.equal(r.visao(e).fila.find(t=>t.proximo).nome,"Ana");
r.acaoCentral(e,{tipo:"ausencia",tecnicoId:id("Ana"),ausencia:"momento"});
assert.equal(r.proximo(e),id("Beto"));
r.acaoPublica(e,{tipo:"solicitar",tecnicoId:id("Beto")});
assert.throws(()=>r.acaoPublica(e,{tipo:"solicitar",tecnicoId:id("Beto")}));
assert.throws(()=>r.acaoPublica(e,{tipo:"marcarFeita",tecnicoId:id("Beto")}));
r.acaoCentral(e,{tipo:"aprovar",solicitacaoId:e.solicitacoes[0].id});
assert.equal(nm(),"Ana,Caio,Duda,Beto");
r.acaoCentral(e,{tipo:"ausencia",tecnicoId:id("Ana"),ausencia:null});
assert.equal(r.proximo(e),id("Ana"));
r.acaoCentral(e,{tipo:"ausencia",tecnicoId:id("Ana"),ausencia:"dia"});
assert.equal(r.proximo(e),id("Caio"));
assert.equal(r.proximo(e,new Date(Date.now()+86400000)),id("Ana"));
r.acaoCentral(e,{tipo:"reordenar",fila:[id("Duda"),id("Caio"),id("Beto"),id("Ana")]});
assert.equal(nm(),"Duda,Caio,Beto,Ana");
assert.throws(()=>r.acaoCentral(e,{tipo:"reordenar",fila:[id("Duda")]}));
r.acaoCentral(e,{tipo:"remover",tecnicoId:id("Caio")});
assert.equal(nm(),"Duda,Beto,Ana");
// Desfazer: volta exatamente ao estado anterior, só com o token certo, e não depois de outra mudança.
r.acaoCentral(e,{tipo:"marcarFeita",tecnicoId:id("Duda")});
assert.equal(nm(),"Beto,Ana,Duda");
const tok = r.visao(e).desfazer.token;
assert.throws(()=>r.acaoCentral(structuredClone(e),{tipo:"desfazer",token:"errado"}));
e = r.acaoCentral(e,{tipo:"desfazer",token:tok});
assert.equal(nm(),"Duda,Beto,Ana");
assert.equal(r.visao(e).desfazer,null);
r.acaoCentral(e,{tipo:"remover",tecnicoId:id("Beto")});
const tok2 = r.visao(e).desfazer.token;
r.acaoPublica(e,{tipo:"solicitar",tecnicoId:id("Ana")});
assert.throws(()=>r.acaoCentral(e,{tipo:"desfazer",token:tok2}));
r.acaoCentral(e,{tipo:"adicionar",nome:"Eva"});
assert.equal(r.visao(e).desfazer,null);
assert.ok(!JSON.stringify(r.visao(e)).includes("antes"));
// Turnos (horário de Brasília = UTC-3): 7h59 fora, 8h manhã, 16h59 manhã, 17h noite, 21h59 noite, 22h fora.
const br = (hm) => new Date(`2026-10-21T${hm}:00-03:00`);
assert.equal(r.turnoDe(br("07:59")), null);
assert.equal(r.turnoDe(br("08:00")), "manha");
assert.equal(r.turnoDe(br("16:59")), "manha");
assert.equal(r.turnoDe(br("17:00")), "noite");
assert.equal(r.turnoDe(br("21:59")), "noite");
assert.equal(r.turnoDe(br("22:00")), null);
{
  let t = r.estadoInicial(["Ana", "Beto"]);
  const [a, b] = t.tecnicos.map((x) => x.id);
  for (const [id, hm] of [[a,"09:00"],[b,"10:00"],[a,"16:30"],[b,"18:00"],[a,"23:00"]]) r.acaoCentral(t, { tipo: "marcarFeita", tecnicoId: id }, br(hm));
  r.acaoCentral(t, { tipo: "marcarFeita", tecnicoId: a }, new Date("2026-10-20T12:00:00-03:00")); // ontem: não conta
  const c = r.contagemTurnos(t, br("19:00"));
  assert.equal(c.atual, "noite");
  assert.deepEqual(c.turnos.map((x) => x.total), [3, 1]);
  assert.deepEqual(c.turnos[0].tecnicos.map((x) => `${x.nome}:${x.qtd}`), ["Ana:2", "Beto:1"]);
  assert.equal(c.fora.total, 1);
}
console.log("ok");
// Saldo como vidas: Micem fora da vez dá saldo e mantém o lugar; quando a vez chega em quem
// tem saldo, ele gasta 1 e vai para o fim na hora.
{
  const s = r.estadoInicial(["A","B","C","D"]);
  const fila = () => r.visao(s).fila.map(t=>t.nome+(t.saldo?`(${t.saldo})`:"")).join(",");
  const prox = () => s.tecnicos.find(t=>t.id===r.proximo(s)).nome;
  r.acaoCentral(s,{tipo:"marcarFeita",tecnicoId:"t3"});            // C fora da vez
  r.acaoCentral(s,{tipo:"marcarFeita",tecnicoId:"t3"});            // C de novo
  assert.equal(fila(),"A,B,C(2),D");
  r.acaoCentral(s,{tipo:"marcarFeita",tecnicoId:"t1"});            // A na vez
  assert.equal(fila(),"B,C(2),D,A");
  r.acaoCentral(s,{tipo:"marcarFeita",tecnicoId:"t2"});            // B na vez: chega a vez de C, que gasta 1
  assert.equal(fila(),"D,A,B,C(1)");
  assert.equal(prox(),"D");
  for (const id of ["t4","t1","t2"]) r.acaoCentral(s,{tipo:"marcarFeita",tecnicoId:id});
  assert.equal(fila(),"D,A,B,C");                                  // C gastou a segunda vida
  // Contador por turno ignora o uso de saldo: 7 Micens de verdade.
  const c = r.contagemTurnos(s);
  assert.equal(c.turnos.reduce((a,t)=>a+t.total,0)+c.fora.total, 7);
  // + saldo para quem é o próximo: gasta na hora e a vez passa.
  r.acaoCentral(s,{tipo:"saldo",tecnicoId:"t4",delta:1});
  assert.equal(fila(),"A,B,C,D");
  assert.equal(prox(),"A");
  // Ajuste manual não fica negativo.
  r.acaoCentral(s,{tipo:"saldo",tecnicoId:"t3",delta:-1});
  assert.equal(fila(),"A,B,C,D");
  // Todos os presentes com saldo: ninguém gasta e o primeiro é o próximo.
  for (const id of ["t2","t3","t4","t1"]) r.acaoCentral(s,{tipo:"saldo",tecnicoId:id,delta:1});
  assert.equal(prox(),r.visao(s).fila[0].nome);
  // Ausente com saldo não gasta; quem está ausente é pulado sem perder vida.
  const s2 = r.estadoInicial(["A","B","C"]);
  r.acaoCentral(s2,{tipo:"ausencia",tecnicoId:"t1",ausencia:"momento"});
  r.acaoCentral(s2,{tipo:"saldo",tecnicoId:"t1",delta:1});
  assert.equal(r.visao(s2).fila.map(t=>t.nome+t.saldo).join(","),"A1,B0,C0");
}
console.log("saldo ok");
